import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { EcrRepository } from "./components/ecr";
import { SecretsManager } from "./components/secrets";
import { FrontendBucket } from "./components/frontend";
import { BackendLambda } from "./components/lambda";
import { AuthorizerLambda } from "./components/authorizer";
import { ApiGateway } from "./components/apiGateway";
import { DnsCertificate, DnsAliasRecords } from "./components/dns";
import { CdnDistribution } from "./components/cdn";

const config = new pulumi.Config();
const projectName = config.require("projectName");
const domain = config.require("domain");
const mediaBucketName = config.require("mediaBucketName");
const hostedZoneDomain = config.require("hostedZoneDomain");
const imageTag = config.get("imageTag") || "latest";

/* ─── Description / comment config values ─── */
const credentialsSecretDescription = config.require("credentialsSecretDescription");
interface CfConfig {
  privateKeyDescription: string;
  publicKeyComment: string;
  keyGroupComment: string;
  oacDescription: string;
  cdnComment: string;
}
const cf = config.requireObject<CfConfig>("cf");

/** Regional domain for the existing media bucket (standard S3 format). */
const mediaBucketRegionalDomain = `${mediaBucketName}.s3.amazonaws.com`;

/* ─── ECR ─── */
const ecr = new EcrRepository("ecr", { projectName });

/* ─── Secrets Manager + CloudFront signing key ─── */
const secrets = new SecretsManager("secrets", {
  projectName,
  credentialsSecretDescription,
  cfPrivateKeyDescription: cf.privateKeyDescription,
  cfPublicKeyComment: cf.publicKeyComment,
  cfKeyGroupComment: cf.keyGroupComment,
});

/* ─── Frontend S3 bucket (created before CDN, policy applied after) ─── */
const frontend = new FrontendBucket("frontend", { projectName });

/* ─── Lambda function ─── */
const lambda = new BackendLambda("backend", {
  ecrRepoUrl: ecr.repo.repositoryUrl,
  imageTag,
  credentialsSecretArn: secrets.credentialsSecret.arn,
  cfPrivateKeySecretArn: secrets.cfPrivateKeySecret.arn,
  cfKeyPairId: secrets.cfPublicKey.id,
  mediaBucketName,
  domain,
});

/* ─── Authorizer Lambda ─── */
const authorizer = new AuthorizerLambda("authorizer", {
  projectName,
  credentialsSecretArn: secrets.credentialsSecret.arn,
});

/* ─── API Gateway ─── */
const apigw = new ApiGateway("api", { projectName, lambdaFn: lambda.fn, authorizerFn: authorizer.fn });

/* ─── DNS + ACM certificate (us-east-1) ─── */
const dns = new DnsCertificate("dns", { domain, hostedZoneDomain });

/* ─── CloudFront distribution ─── */
const cdn = new CdnDistribution("cdn", {
  projectName,
  frontendBucket: frontend.bucket,
  mediaBucketName,
  mediaBucketRegionalDomain,
  apiGatewayUrl: apigw.api.apiEndpoint,
  certificateArn: dns.certificateValidation.certificateArn,
  cfKeyGroupId: secrets.cfKeyGroup.id,
  domain,
  oacDescription: cf.oacDescription,
  cdnComment: cf.cdnComment,
});

/* ─── Frontend bucket policy (applied after CDN exists to reference its ARN) ─── */
frontend.applyBucketPolicy(cdn.distribution.arn);

/* ─── Media bucket policy (grants CloudFront OAC read access to the pre-existing media bucket) ─── */
new aws.s3.BucketPolicy("media-bucket-policy", {
  bucket: mediaBucketName,
  policy: cdn.distribution.arn.apply((distArn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCloudFrontOAC",
          Effect: "Allow",
          Principal: { Service: "cloudfront.amazonaws.com" },
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${mediaBucketName}/*`,
          Condition: {
            StringEquals: {
              "AWS:SourceArn": distArn,
            },
          },
        },
      ],
    }),
  ),
});

/* ─── Route 53 alias records ─── */
new DnsAliasRecords("dns-alias", {
  zoneId: dns.zone.zoneId,
  domain,
  cloudfrontDomainName: cdn.distribution.domainName,
  cloudfrontHostedZoneId: cdn.distribution.hostedZoneId,
});

/* ─── Stack outputs ─── */
export const ecrRepositoryUrl = ecr.repo.repositoryUrl;
export const cloudfrontDomainName = cdn.distribution.domainName;
export const cloudfrontDistributionId = cdn.distribution.id;
export const apiGatewayEndpoint = apigw.api.apiEndpoint;
export const frontendBucketName = frontend.bucket.bucket;
export const cdnLogBucketName = cdn.logBucket.bucket;
export const credentialsSecretArn = secrets.credentialsSecret.arn;
export const siteUrl = `https://${domain}`;
