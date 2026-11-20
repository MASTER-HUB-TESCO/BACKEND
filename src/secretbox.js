// Encryption for stored credential passwords. AES-256-GCM (authenticated encryption) so a
// password is never written to the database as plain text, and tampering is detectable.
//
// The key is derived (scrypt) from CRED_ENC_KEY when set, otherwise from JWT_SECRET — so the
// Hub works out of the box, and credentials stay decryptable across restarts/redeploys as long
// as that secret is unchanged. For production, set a dedicated CRED_ENC_KEY in Backend/.env
// (a long random string) so credential encryption is independent of the JWT secret.
import crypto from 'crypto';
import { config } from './config.js';

const KEY = crypto.scryptSync(String(config.credEncKey || config.jwtSecret), 'tesco-mh-credentials-v1', 32);

// Encrypt a plain string -> { iv, tag, data } (all base64). Returns undefined for empty input
// so an empty password is simply not stored.
export function encryptSecret(plain) {
  const text = String(plain ?? '');
  if (!text) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') };
}

// Decrypt { iv, tag, data } -> plain string. Returns '' if missing or on any failure (never throws).
export function decryptSecret(enc) {
  if (!enc || !enc.iv || !enc.data || !enc.tag) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(enc.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(enc.data, 'base64')), decipher.final()]);
    return out.toString('utf8');
  } catch { return ''; }
}
