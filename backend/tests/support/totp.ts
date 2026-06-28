import { createHmac } from 'crypto';

export function createTotpCode(secret: string, date: Date = new Date()) {
  const counter = Buffer.alloc(8);
  const key = base32Decode(secret);
  const timeStep = Math.floor(date.getTime() / 1000 / 30);

  counter.writeUInt32BE(Math.floor(timeStep / 2 ** 32), 0);
  counter.writeUInt32BE(timeStep >>> 0, 4);

  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

function base32Decode(secret: string) {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  for (const character of secret.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(character);

    if (index === -1) {
      throw new Error('Invalid base32 character.');
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}
