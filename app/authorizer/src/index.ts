/**
 * API Gateway Lambda authorizer for protected routes. Validates the JWT session
 * cookie against the shared secret stored in AWS Secrets Manager. Returns a
 * simple allow/deny response used by API Gateway HTTP API (payload format 2.0).
 *
 * Also validates the x-origin-verify header injected by CloudFront to ensure
 * requests originate from the CDN rather than hitting API Gateway directly.
 *
 * Exports two handlers:
 * - handler: validates origin header + JWT cookie (for protected routes)
 * - originHandler: validates origin header only (for unprotected routes)
 */
import {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { timingSafeEqual } from 'crypto';
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

function verifyOriginHeader(event: APIGatewayRequestAuthorizerEventV2): boolean {
  const expected = process.env.CLOUDFRONT_ORIGIN_SECRET || '';
  const actual = event.headers?.['x-origin-verify'] || '';
  if (!expected || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<Record<string, never>>> {
  try {
    if (!verifyOriginHeader(event)) {
      return { isAuthorized: false, context: {} };
    }

    const cookies = event.cookies || [];
    const sessionCookie = cookies.find((c) => c.startsWith('session='));
    if (!sessionCookie) {
      return { isAuthorized: false, context: {} };
    }

    const token = sessionCookie.substring('session='.length);
    const jwtSecret = await getJwtSecret();
    jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });

    return { isAuthorized: true, context: {} };
  } catch {
    return { isAuthorized: false, context: {} };
  }
}

export async function originHandler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<Record<string, never>>> {
  return {
    isAuthorized: verifyOriginHeader(event),
    context: {},
  };
}
