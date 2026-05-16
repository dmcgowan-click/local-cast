import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** Constructor arguments for the FrontendBucket component. */
export interface FrontendBucketArgs {
  /** Project name prefix for AWS resource names. */
  projectName: string;
}

/**
 * S3 bucket for hosting the Vue.js frontend SPA.
 * The bucket is private with all public access blocked; access is granted
 * exclusively via a CloudFront OAC bucket policy.
 *
 * Call applyBucketPolicy() after the CloudFront distribution is created
 * to attach the OAC-scoped bucket policy.
 */
export class FrontendBucket extends pulumi.ComponentResource {
  /** The S3 bucket holding the frontend assets. */
  public readonly bucket: aws.s3.BucketV2;

  constructor(name: string, args: FrontendBucketArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:FrontendBucket", name, args, opts);

    this.bucket = new aws.s3.BucketV2("frontend-bucket", {
      bucketPrefix: `${args.projectName}-frontend-`,
      forceDestroy: true,
    }, { parent: this });

    /** Block all public access to the frontend bucket. */
    new aws.s3.BucketPublicAccessBlock("frontend-public-access-block", {
      bucket: this.bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    }, { parent: this });

    this.registerOutputs({
      bucket: this.bucket,
    });
  }

  /**
   * Attaches the S3 bucket policy allowing CloudFront OAC read access.
   * Must be called after the CloudFront distribution is created.
   */
  applyBucketPolicy(cloudfrontDistributionArn: pulumi.Output<string>) {
    new aws.s3.BucketPolicy("frontend-bucket-policy", {
      bucket: this.bucket.id,
      policy: pulumi.all([this.bucket.arn, cloudfrontDistributionArn]).apply(
        ([bucketArn, distArn]) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AllowCloudFrontOAC",
                Effect: "Allow",
                Principal: { Service: "cloudfront.amazonaws.com" },
                Action: "s3:GetObject",
                Resource: `${bucketArn}/*`,
                Condition: {
                  StringEquals: {
                    "AWS:SourceArn": distArn,
                  },
                },
              },
            ],
          }),
      ),
    }, { parent: this });
  }
}
