import crypto from 'node:crypto';

export function decryptApiKey(encrypted: string): string {
  if (!encrypted) return '';
  if (encrypted.startsWith('sk-') || encrypted.startsWith('nv-')) return encrypted;
  try {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'dev-key-change-in-production-32b', 'salt', 32);
    const parts = encrypted.split(':');
    if (parts.length !== 3) return encrypted;
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const enc = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(tag);
    return (decipher.update(enc) as Buffer).toString('utf-8') + decipher.final('utf-8');
  } catch {
    throw new Error('Failed to decrypt API key. Check ENCRYPTION_KEY environment variable.');
  }
}
