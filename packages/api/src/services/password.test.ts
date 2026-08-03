import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('Correct horse battery staple', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);

    expect(a).not.toBe(b);
    await expect(verifyPassword('same-password', a)).resolves.toBe(true);
    await expect(verifyPassword('same-password', b)).resolves.toBe(true);
  });

  it('records its parameters in the hash so they can be raised later', async () => {
    const hash = await hashPassword('x');
    const [scheme, n, r, p, salt, key] = hash.split('$');

    expect(scheme).toBe('scrypt');
    expect(Number(n)).toBeGreaterThanOrEqual(2 ** 17);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(salt).toBeTruthy();
    expect(key).toBeTruthy();
  });

  it('never stores the password itself', async () => {
    const hash = await hashPassword('super-secret-value');
    expect(hash).not.toContain('super-secret-value');
  });

  it('handles unicode consistently via NFKC normalisation', async () => {
    // The same grapheme composed two different ways must still sign in.
    const hash = await hashPassword('paßwort-é');
    await expect(verifyPassword('paßwort-é', hash)).resolves.toBe(true);
  });

  it('returns false rather than throwing for a null or corrupt stored hash', async () => {
    await expect(verifyPassword('x', null)).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$1$2$3')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$16384$8$1$c2FsdA$a2V5')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$abc$8$1$c2FsdA$a2V5')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$$')).resolves.toBe(false);
  });
});
