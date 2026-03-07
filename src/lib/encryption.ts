import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export function encrypt(data: any, password: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: salt:iv:tag:encryptedData (all hex)
    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encryptedData: string, password: string): any {
    const [saltHex, ivHex, tagHex, dataHex] = encryptedData.split(':');

    if (!saltHex || !ivHex || !tagHex || !dataHex) {
        throw new Error('Invalid encrypted data format');
    }

    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(dataHex, 'hex');

    const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
}
