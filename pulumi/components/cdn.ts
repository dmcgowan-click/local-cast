import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** Constructor arguments for the CdnDistribution component. */
export interface CdnDistributionArgs {
  /** Project name prefix for AWS resource names. */
  projectName: string;
  /** The S3 bucket holding frontend assets. */
  frontendBucket: aws.s3.BucketV2;
  /** Name of the existing S3 media bucket. */
  mediaBucketName: string;
  /** Regional domain name of the media bucket. */
  mediaBucketRegionalDomain: string;
  /** Full API Gateway endpoint URL. */
  apiGatewayUrl: pulumi.Output<string>;
  /** ARN of the validated ACM certificate. */
  certificateArn: pulumi.Output<string>;
  /** CloudFront key group ID for signed URL access. */
  cfKeyGroupId: pulumi.Output<string>;
  /** Custom domain name for the distribution. */
  domain: string;
  /** Description for the Origin Access Control. */
  oacDescription: string;
  /** Comment for the CloudFront distribution. */
  cdnComment: string;
}

/**
 * CloudFront distribution with three origins:
 * 1. Default (/*) — Frontend S3 bucket via OAC
 * 2. /media/* — Media S3 bucket for signed URL access
 * 3. /api/* — API Gateway HTTP API, cache disabled, all headers/cookies forwarded
 *
 * Also creates the Origin Access Control for the S3 origins.
 */
export class CdnDistribution extends pulumi.ComponentResource {
  /** The CloudFront distribution resource. */
  public readonly distribution: aws.cloudfront.Distribution;
  /** Origin Access Control used by the S3 origins. */
  public readonly oac: aws.cloudfront.OriginAccessControl;

  constructor(name: string, args: CdnDistributionArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:CdnDistribution", name, args, opts);

    /** Origin Access Control for S3 origins — replaces legacy OAI. */
    this.oac = new aws.cloudfront.OriginAccessControl("s3-oac", {
      name: `${args.projectName}-s3-oac`,
      originAccessControlOriginType: "s3",
      signingBehavior: "always",
      signingProtocol: "sigv4",
      description: args.oacDescription,
    }, { parent: this });

    /** Response headers policy enforcing HSTS, X-Frame-Options, and X-Content-Type-Options. */
    const responseHeadersPolicy = new aws.cloudfront.ResponseHeadersPolicy("security-headers", {
      name: `${args.projectName}-security-headers`,
      securityHeadersConfig: {
        strictTransportSecurity: {
          override: true,
          accessControlMaxAgeSec: 31536000,
          includeSubdomains: true,
          preload: true,
        },
        frameOptions: {
          override: true,
          frameOption: "DENY",
        },
        contentTypeOptions: {
          override: true,
        },
      },
    }, { parent: this });

    /**
     * Extract the API Gateway domain from the full URL.
     * Input: "https://abc123.execute-api.ap-southeast-2.amazonaws.com"
     * Output: "abc123.execute-api.ap-southeast-2.amazonaws.com"
     */
    const apiDomain = args.apiGatewayUrl.apply((url) => {
      const parsed = new URL(url);
      return parsed.hostname;
    });

    /** The CloudFront distribution serving frontend, media, and API traffic. */
    this.distribution = new aws.cloudfront.Distribution("cdn-distribution", {
      enabled: true,
      isIpv6Enabled: true,
      comment: args.cdnComment,
      defaultRootObject: "index.html",
      aliases: [args.domain],
      priceClass: "PriceClass_200",

      viewerCertificate: {
        acmCertificateArn: args.certificateArn,
        sslSupportMethod: "sni-only",
        minimumProtocolVersion: "TLSv1.2_2021",
      },

      restrictions: {
        geoRestriction: {
          restrictionType: "none",
        },
      },

      /* ─── Origin 1: Frontend S3 bucket ─── */
      origins: [
        {
          originId: "frontend-s3",
          domainName: args.frontendBucket.bucketRegionalDomainName,
          originAccessControlId: this.oac.id,
        },
        /* ─── Origin 2: Media S3 bucket ─── */
        {
          originId: "media-s3",
          domainName: args.mediaBucketRegionalDomain,
          originAccessControlId: this.oac.id,
        },
        /* ─── Origin 3: API Gateway ─── */
        {
          originId: "api-gateway",
          domainName: apiDomain,
          customOriginConfig: {
            httpPort: 80,
            httpsPort: 443,
            originProtocolPolicy: "https-only",
            originSslProtocols: ["TLSv1.2"],
          },
        },
      ],

      /* ─── Default behavior: Frontend SPA ─── */
      defaultCacheBehavior: {
        targetOriginId: "frontend-s3",
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD", "OPTIONS"],
        cachedMethods: ["GET", "HEAD"],
        compress: true,
        cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6", // CachingOptimized
        responseHeadersPolicyId: responseHeadersPolicy.id,
      },

      /* ─── /api/* behavior: proxy to API Gateway, no caching ─── */
      orderedCacheBehaviors: [
        {
          pathPattern: "/api/*",
          targetOriginId: "api-gateway",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
          cachedMethods: ["GET", "HEAD"],
          compress: true,
          cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // CachingDisabled
          originRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac", // AllViewerExceptHostHeader
          responseHeadersPolicyId: responseHeadersPolicy.id,
        },
        /* ─── /media/* behavior: signed URL access to media bucket ─── */
        {
          pathPattern: "/media/*",
          targetOriginId: "media-s3",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["GET", "HEAD", "OPTIONS"],
          cachedMethods: ["GET", "HEAD"],
          compress: true,
          trustedKeyGroups: [args.cfKeyGroupId],
          cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6", // CachingOptimized
          responseHeadersPolicyId: responseHeadersPolicy.id,
        },
      ],

      /**
       * Custom error response to support SPA client-side routing.
       * Returns index.html for 403/404 so Vue Router handles the path.
       */
      customErrorResponses: [
        {
          errorCode: 403,
          responseCode: 200,
          responsePagePath: "/index.html",
          errorCachingMinTtl: 10,
        },
        {
          errorCode: 404,
          responseCode: 200,
          responsePagePath: "/index.html",
          errorCachingMinTtl: 10,
        },
      ],
    }, { parent: this });

    this.registerOutputs({
      distribution: this.distribution,
      oac: this.oac,
    });
  }
}
