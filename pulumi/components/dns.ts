import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** Constructor arguments for the DnsCertificate component. */
export interface DnsCertificateArgs {
  /** The domain name for the ACM certificate (e.g. cast.dmcgowan.click). */
  domain: string;
  /** The parent hosted zone domain (e.g. dmcgowan.click). */
  hostedZoneDomain: string;
}

/**
 * Looks up the existing Route 53 hosted zone and creates an ACM certificate
 * with DNS validation. The certificate covers both the domain and wildcard.
 *
 * CloudFront requires ACM certificates in us-east-1, so a separate provider
 * is used for the certificate and its validation resources.
 */
export class DnsCertificate extends pulumi.ComponentResource {
  /** The existing Route 53 hosted zone. */
  public readonly zone: pulumi.Output<aws.route53.GetZoneResult>;
  /** The validated ACM certificate, ready for use by CloudFront. */
  public readonly certificateValidation: aws.acm.CertificateValidation;

  constructor(name: string, args: DnsCertificateArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:DnsCertificate", name, args, opts);

    /** Provider targeting us-east-1, required for CloudFront ACM certificates. */
    const usEast1 = new aws.Provider("us-east-1", {
      region: "us-east-1",
    }, { parent: this });

    /** Look up the existing hosted zone — we must not create a new one. */
    this.zone = aws.route53.getZoneOutput({
      name: args.hostedZoneDomain,
      privateZone: false,
    });

    /** ACM certificate covering the domain and its wildcard subdomain. */
    const certificate = new aws.acm.Certificate(
      "acm-certificate",
      {
        domainName: args.domain,
        subjectAlternativeNames: [`*.${args.domain}`],
        validationMethod: "DNS",
      },
      { provider: usEast1, parent: this },
    );

    /**
     * Create Route 53 DNS records for ACM domain validation.
     * Iterates over the validation options to support both the domain and wildcard SAN.
     */
    certificate.domainValidationOptions.apply((options) =>
      options.map(
        (opt, i) =>
          new aws.route53.Record(`acm-validation-${i}`, {
            zoneId: this.zone.zoneId,
            name: opt.resourceRecordName,
            type: opt.resourceRecordType,
            records: [opt.resourceRecordValue],
            ttl: 60,
            allowOverwrite: true,
          }, { parent: this }),
      ),
    );

    /** Wait for the certificate to be validated before it can be used by CloudFront. */
    this.certificateValidation = new aws.acm.CertificateValidation(
      "acm-certificate-validation",
      {
        certificateArn: certificate.arn,
        validationRecordFqdns: certificate.domainValidationOptions.apply((options) =>
          options.map((opt) => opt.resourceRecordName),
        ),
      },
      { provider: usEast1, parent: this },
    );

    this.registerOutputs({
      zone: this.zone,
      certificateValidation: this.certificateValidation,
    });
  }
}

/** Constructor arguments for the DnsAliasRecords component. */
export interface DnsAliasRecordsArgs {
  /** Route 53 hosted zone ID. */
  zoneId: pulumi.Output<string>;
  /** Domain name for the alias records. */
  domain: string;
  /** CloudFront distribution domain name. */
  cloudfrontDomainName: pulumi.Output<string>;
  /** CloudFront distribution hosted zone ID. */
  cloudfrontHostedZoneId: pulumi.Output<string>;
}

/**
 * Route 53 A and AAAA alias records pointing the domain to the CloudFront distribution.
 */
export class DnsAliasRecords extends pulumi.ComponentResource {
  constructor(name: string, args: DnsAliasRecordsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:DnsAliasRecords", name, args, opts);

    /** A record aliased to CloudFront distribution. */
    new aws.route53.Record("dns-a-record", {
      zoneId: args.zoneId,
      name: args.domain,
      type: "A",
      aliases: [
        {
          name: args.cloudfrontDomainName,
          zoneId: args.cloudfrontHostedZoneId,
          evaluateTargetHealth: false,
        },
      ],
    }, { parent: this });

    /** AAAA record aliased to CloudFront distribution (IPv6 support). */
    new aws.route53.Record("dns-aaaa-record", {
      zoneId: args.zoneId,
      name: args.domain,
      type: "AAAA",
      aliases: [
        {
          name: args.cloudfrontDomainName,
          zoneId: args.cloudfrontHostedZoneId,
          evaluateTargetHealth: false,
        },
      ],
    }, { parent: this });

    this.registerOutputs({});
  }
}
