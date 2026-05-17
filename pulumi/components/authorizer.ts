import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** Constructor arguments for the AuthorizerLambda component. */
export interface AuthorizerLambdaArgs {
  /** Project name prefix for AWS resource names. */
  projectName: string;
  /** ARN of the Secrets Manager credentials secret (contains the JWT secret). */
  credentialsSecretArn: pulumi.Output<string>;
  /** Shared secret injected by CloudFront as a custom origin header. */
  cloudFrontOriginSecret: pulumi.Output<string>;
}

/**
 * Lightweight Lambda functions used as API Gateway request authorizers.
 * - fn: validates JWT session cookie + CloudFront origin header (protected routes)
 * - originVerifyFn: validates CloudFront origin header only (unprotected routes)
 * Deployed as a zip bundle (fast cold starts) rather than a container image.
 */
export class AuthorizerLambda extends pulumi.ComponentResource {
  /** The authorizer Lambda for protected routes (cookie + origin header). */
  public readonly fn: aws.lambda.Function;
  /** The authorizer Lambda for unprotected routes (origin header only). */
  public readonly originVerifyFn: aws.lambda.Function;

  constructor(name: string, args: AuthorizerLambdaArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:AuthorizerLambda", name, args, opts);

    /** IAM role assumed by the authorizer Lambda at runtime. */
    const role = new aws.iam.Role("authorizer-role", {
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
    new aws.iam.RolePolicyAttachment("authorizer-basic-execution", {
      role: role.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    }, { parent: this });

    /** Inline policy granting read access to the credentials secret. */
    new aws.iam.RolePolicy("authorizer-secrets-policy", {
      role: role.id,
      policy: args.credentialsSecretArn.apply((arn) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["secretsmanager:GetSecretValue"],
              Resource: [arn],
            },
          ],
        }),
      ),
    }, { parent: this });

    /** The authorizer Lambda function (zip-deployed, fast cold starts). */
    this.fn = new aws.lambda.Function("authorizer-lambda", {
      runtime: "nodejs20.x",
      handler: "index.handler",
      code: new pulumi.asset.FileArchive("./authorizer-bundle"),
      role: role.arn,
      timeout: 10,
      memorySize: 128,
      architectures: ["arm64"],
      environment: {
        variables: {
          CREDENTIALS_SECRET_ARN: args.credentialsSecretArn,
          CLOUDFRONT_ORIGIN_SECRET: args.cloudFrontOriginSecret,
        },
      },
    }, { parent: this });

    /** Origin-verify-only Lambda for unprotected routes. Same bundle, different handler. */
    this.originVerifyFn = new aws.lambda.Function("origin-verify-lambda", {
      runtime: "nodejs20.x",
      handler: "index.originHandler",
      code: new pulumi.asset.FileArchive("./authorizer-bundle"),
      role: role.arn,
      timeout: 5,
      memorySize: 128,
      architectures: ["arm64"],
      environment: {
        variables: {
          CLOUDFRONT_ORIGIN_SECRET: args.cloudFrontOriginSecret,
        },
      },
    }, { parent: this });

    this.registerOutputs({
      fn: this.fn,
      originVerifyFn: this.originVerifyFn,
    });
  }
}
