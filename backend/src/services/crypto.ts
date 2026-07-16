import crypto from "crypto"

export function encryptSecret(secret: string, key: Buffer<ArrayBufferLike>): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = cipher.update(secret, "utf8");
    cipher.final();
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((b) => b.toString('hex')).join(':'); // iv:tag:encrypted
}

export function decryptSecret(encrypted: string, key: Buffer<ArrayBufferLike>): string {
    const [ivHex, tagHex, encryptedHex] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = decipher.update(encryptedBuffer, undefined, 'utf8');
    decipher.final();
    return decrypted;
}