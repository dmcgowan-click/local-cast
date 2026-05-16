/**
 * API Gateway Lambda authorizer for protected routes. Validates the JWT session
 * cookie against the shared secret stored in AWS Secrets Manager. Returns a
 * simple allow/deny response used by API Gateway HTTP API (payload format 2.0).
 */
import {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import jwt from 'jsonwebtoken';

const client = new SecretsManagerClient({});

let cachedJwtSecret: string | null = null;

async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret) return cachedJwtSecret;

  const secretArn = process.env.CREDENTIALS_SECRET_ARN;
  if (!secretArn) throw new Error('CREDENTIALS_SECRET_ARN not set');

  const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!result.SecretString) throw new Error('Empty credentials secret');

  const parsed = JSON.parse(result.SecretString);
  cachedJwtSecret = parsed.jwtSecret;
  return cachedJwtSecret!;
}

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<Record<string, never>>> {
  try {
    const cookies = event.cookies || [];
    const sessionCookie = cookies.find((c) => c.startsWith('session='));
    if (!sessionCookie) {
      return { isAuthorized: false, context: {} };
    }

    const token = sessionCookie.substring('session='.length);
    const jwtSecret = await getJwtSecret();
    jwt.verify(token, jwtSecret);

    return { isAuthorized: true, context: {} };
  } catch {
    return { isAuthorized: false, context: {} };
  }
}
