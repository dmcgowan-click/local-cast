import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

/** Shape of the user credentials secret stored in AWS Secrets Manager. */
interface Credentials {
  username: string;
  passwordHash: string;
  jwtSecret: string;
}

let cachedCredentials: Credentials | null = null;
let cachedCfKey: string | null = null;

/**
 * Retrieves user credentials (username, password hash, JWT secret) from
 * Secrets Manager. Results are cached in-memory for the lifetime of the
 * Lambda execution environment to avoid repeated API calls.
 */
export async function getCredentials(): Promise<Credentials> {
  if (cachedCredentials) return cachedCredentials;

  const secretArn = process.env.CREDENTIALS_SECRET_ARN;
  if (!secretArn) throw new Error('CREDENTIALS_SECRET_ARN not set');

  const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!result.SecretString) throw new Error('Empty credentials secret');

  cachedCredentials = JSON.parse(result.SecretString) as Credentials;
  return cachedCredentials;
}

/**
 * Retrieves the CloudFront signing private key from Secrets Manager.
 * Cached in-memory after the first call.
 */
export async function getCloudFrontPrivateKey(): Promise<string> {
  if (cachedCfKey) return cachedCfKey;

  const secretArn = process.env.CLOUDFRONT_PRIVATE_KEY_SECRET_ARN;
  if (!secretArn) throw new Error('CLOUDFRONT_PRIVATE_KEY_SECRET_ARN not set');

  const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!result.SecretString) throw new Error('Empty CloudFront key secret');

  cachedCfKey = result.SecretString;
  return cachedCfKey;
}
