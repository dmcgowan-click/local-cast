import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { getCloudFrontPrivateKey } from './secrets';

const SIGNED_URL_EXPIRY_HOURS = 6;

/**
 * Generates a CloudFront signed URL for the given S3 object key.
 * The URL is valid for 6 hours and uses the private key stored in Secrets Manager.
 */
export async function generateSignedUrl(objectKey: string): Promise<string> {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  if (!domain) throw new Error('CLOUDFRONT_DOMAIN not set');
  if (!keyPairId) throw new Error('CLOUDFRONT_KEY_PAIR_ID not set');

  const privateKey = await getCloudFrontPrivateKey();
  const encodedKey = objectKey.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  const url = `https://${domain}/media/${encodedKey}`;
  const dateLessThan = new Date(Date.now() + SIGNED_URL_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  return getSignedUrl({
    url,
    keyPairId,
    privateKey,
    dateLessThan,
  });
}
