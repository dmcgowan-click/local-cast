import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";

/** Constructor arguments for the SecretsManager component. */
export interface SecretsManagerArgs {
  /** Project name prefix for AWS resource names. */
  projectName: string;
  /** Description for the credentials secret. */
  credentialsSecretDescription: string;
  /** Description for the CloudFront private key secret. */
  cfPrivateKeyDescription: string;
  /** Comment for the CloudFront public key. */
  cfPublicKeyComment: string;
  /** Comment for the CloudFront key group. */
  cfKeyGroupComment: string;
}

/**
 * Secrets Manager secrets and CloudFront signing key pair.
 *
 * - Credentials secret: placeholder JSON with username, passwordHash, jwtSecret.
 *   Must be updated manually after initial deploy.
 * - CloudFront signing key: auto-generated RSA key pair. Private key stored in
 *   Secrets Manager, public key registered with CloudFront for signed URL validation.
 */
export class SecretsManager extends pulumi.ComponentResource {
  /** Secret containing user credentials (username, passwordHash, jwtSecret). */
  public readonly credentialsSecret: aws.secretsmanager.Secret;
  /** Secret containing the CloudFront signing private key. */
  public readonly cfPrivateKeySecret: aws.secretsmanager.Secret;
  /** CloudFront public key registered for signed URL verification. */
  public readonly cfPublicKey: aws.cloudfront.PublicKey;
  /** CloudFront key group referencing the public key. */
  public readonly cfKeyGroup: aws.cloudfront.KeyGroup;

  constructor(name: string, args: SecretsManagerArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:SecretsManager", name, args, opts);

    /** User credentials secret with placeholder values. Update after deploy. */
    this.credentialsSecret = new aws.secretsmanager.Secret("credentials-secret", {
      name: `${args.projectName}/credentials`,
      description: args.credentialsSecretDescription,
    }, { parent: this });

    new aws.secretsmanager.SecretVersion("credentials-secret-version", {
      secretId: this.credentialsSecret.id,
      secretString: JSON.stringify({
        username: "CHANGE_ME",
        passwordHash: "CHANGE_ME",
        jwtSecret: "CHANGE_ME",
      }),
    }, { parent: this });

    /** Generate an RSA key pair for CloudFront signed URLs. */
    const signingKey = new tls.PrivateKey("cf-signing-key", {
      algorithm: "RSA",
      rsaBits: 2048,
    }, { parent: this });

    /** Store the private key in Secrets Manager for the Lambda to retrieve at runtime. */
    this.cfPrivateKeySecret = new aws.secretsmanager.Secret("cf-private-key-secret", {
      name: `${args.projectName}/cloudfront-private-key`,
      description: args.cfPrivateKeyDescription,
    }, { parent: this });

    new aws.secretsmanager.SecretVersion("cf-private-key-version", {
      secretId: this.cfPrivateKeySecret.id,
      secretString: signingKey.privateKeyPem,
    }, { parent: this });

    /** Register the public key with CloudFront for signed URL verification. */
    this.cfPublicKey = new aws.cloudfront.PublicKey("cf-public-key", {
      name: `${args.projectName}-signing-key`,
      encodedKey: signingKey.publicKeyPem,
      comment: args.cfPublicKeyComment,
    }, { parent: this });

    /** Key group that references the public key, used by CloudFront cache behaviors. */
    this.cfKeyGroup = new aws.cloudfront.KeyGroup("cf-key-group", {
      name: `${args.projectName}-key-group`,
      items: [this.cfPublicKey.id],
      comment: args.cfKeyGroupComment,
    }, { parent: this });

    this.registerOutputs({
      credentialsSecret: this.credentialsSecret,
      cfPrivateKeySecret: this.cfPrivateKeySecret,
      cfPublicKey: this.cfPublicKey,
      cfKeyGroup: this.cfKeyGroup,
    });
  }
}
