import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** Constructor arguments for the BackendLambda component. */
export interface BackendLambdaArgs {
  /** ECR repository URL for the container image. */
  ecrRepoUrl: pulumi.Output<string>;
  /** Docker image tag to deploy. */
  imageTag: string;
  /** ARN of the Secrets Manager credentials secret. */
  credentialsSecretArn: pulumi.Output<string>;
  /** ARN of the Secrets Manager CloudFront private key secret. */
  cfPrivateKeySecretArn: pulumi.Output<string>;
  /** CloudFront key pair ID for signed URLs. */
  cfKeyPairId: pulumi.Output<string>;
  /** Name of the S3 media bucket. */
  mediaBucketName: string;
  /** Domain name for the CloudFront distribution. */
  domain: string;
}

/**
 * Lambda function (container image), its IAM execution role, and associated
 * permissions. The function runs the backend API server behind the AWS Lambda
 * Web Adapter.
 */
export class BackendLambda extends pulumi.ComponentResource {
  /** The Lambda function resource. */
  public readonly fn: aws.lambda.Function;
  /** The IAM execution role for the Lambda function. */
  public readonly role: aws.iam.Role;

  constructor(name: string, args: BackendLambdaArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:BackendLambda", name, args, opts);

    /** IAM role assumed by the Lambda function at runtime. */
    this.role = new aws.iam.Role("lambda-role", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    }, { parent: this });

    /** Attach basic Lambda execution policy for CloudWatch Logs. */
    new aws.iam.RolePolicyAttachment("lambda-basic-execution", {
      role: this.role.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    }, { parent: this });

    /** Inline policy granting least-privilege access to S3 media bucket and Secrets Manager. */
    new aws.iam.RolePolicy("lambda-app-policy", {
      role: this.role.id,
      policy: pulumi
        .all([args.credentialsSecretArn, args.cfPrivateKeySecretArn])
        .apply(([credsArn, cfKeyArn]) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "S3MediaRead",
                Effect: "Allow",
                Action: ["s3:ListBucket"],
                Resource: `arn:aws:s3:::${args.mediaBucketName}`,
              },
              {
                Sid: "S3MediaGetObject",
                Effect: "Allow",
                Action: ["s3:GetObject"],
                Resource: `arn:aws:s3:::${args.mediaBucketName}/*`,
              },
              {
                Sid: "SecretsManagerRead",
                Effect: "Allow",
                Action: ["secretsmanager:GetSecretValue"],
                Resource: [credsArn, cfKeyArn],
              },
            ],
          }),
        ),
    }, { parent: this });

    /** The Lambda function running the backend container image. */
    this.fn = new aws.lambda.Function("backend-lambda", {
      packageType: "Image",
      imageUri: pulumi.interpolate`${args.ecrRepoUrl}:${args.imageTag}`,
      role: this.role.arn,
      timeout: 30,
      memorySize: 512,
      architectures: ["arm64"],
      reservedConcurrentExecutions: 1,
      environment: {
        variables: {
          MEDIA_BUCKET: args.mediaBucketName,
          CREDENTIALS_SECRET_ARN: args.credentialsSecretArn,
          CLOUDFRONT_PRIVATE_KEY_SECRET_ARN: args.cfPrivateKeySecretArn,
          CLOUDFRONT_KEY_PAIR_ID: args.cfKeyPairId,
          CLOUDFRONT_DOMAIN: args.domain,
          AWS_LWA_READINESS_CHECK_PATH: "/api/health",
        },
      },
    }, { parent: this });

    this.registerOutputs({
      fn: this.fn,
      role: this.role,
    });
  }
}
