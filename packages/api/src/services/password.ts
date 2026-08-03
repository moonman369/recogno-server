/**
 * Password hashing on `node:crypto` scrypt.
 *
 * scrypt is a memory-hard KDF built into Node, so there is no native module to
 * compile — which matters on Windows, where argon2/bcrypt routinely need a
 * toolchain. Parameters are stored inside the hash string so they can be raised
 * later without invalidating existing passwords.
 */

import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Hand-rolled rather than `promisify(scrypt)`: promisify resolves to the
 * overload without an options argument, so the cost parameters below would be
 * silently dropped.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** OWASP's minimum for scrypt: N=2^17, r=8, p=1. */
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Node's default is 32MB, which is under what N=2^17 needs. */
const MAX_MEMORY = 256 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** `scrypt$N$r$p$salt$key`, both binary parts base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAX_MEMORY,
  });

  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Constant-time comparison. Returns false rather than throwing on a malformed
 * stored hash, so a corrupt row is a failed login rather than a 500.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const N = Number.parseInt(rawN, 10);
  const r = Number.parseInt(rawR, 10);
  const p = Number.parseInt(rawP, 10);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  try {
    const salt = Buffer.from(rawSalt, 'base64url');
    const expected = Buffer.from(rawKey, 'base64url');
    if (salt.length === 0 || expected.length === 0) return false;

    const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY,
    });

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
