/**
 * Generate an RS256 keypair for admin JWT signing and print it as base64 PEM,
 * ready to paste into `server/.env`. Keep the private key secret.
 *
 * Usage: npm run generate-keys --workspace server
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const b64 = (pem: string): string => Buffer.from(pem, 'utf8').toString('base64');

console.log('# RS256 keypair for admin JWTs — paste into server/.env (keep the private key secret):');
console.log(`ADMIN_JWT_PRIVATE_KEY=${b64(privateKey)}`);
console.log(`ADMIN_JWT_PUBLIC_KEY=${b64(publicKey)}`);
