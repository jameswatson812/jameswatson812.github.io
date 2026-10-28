// Sign-in for the practice database. The database file is encrypted with one random key; that key is
// stored once per enrolled username, each copy encrypted under a key derived from the username
// (PBKDF2-HMAC-SHA256, then AES-256-GCM, as on the site's other protected pages). No username is
// stored on the site, not even as a hash. Used by the page and by the local publish step.

/** Mednet usernames compare trimmed, in lower case, without any @... suffix. */
export function normalizeUsername(s) {
  return String(s ?? '').trim().toLowerCase().split('@')[0].trim();
}

export const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function deriveUserKey(username, salt, iterations, usages = ['decrypt']) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeUsername(username)),
    'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, usages);
}

/** The database key, for an enrolled username: known before the 9.5 MB download starts. */
export async function unwrapKey(username, keys) {
  if (!normalizeUsername(username)) throw new Error('not-enrolled');
  const userKey = await deriveUserKey(username, fromBase64(keys.salt), keys.iter);
  for (const w of keys.wrapped) {
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(w.iv) }, userKey, fromBase64(w.ct)));
    } catch {
      // another person's copy of the key: the authentication tag does not match
    }
  }
  throw new Error('not-enrolled');
}

/** The SQLite file's bytes from db.bin (gzip, then AES-GCM) and the unwrapped database key. */
export async function decryptDatabase(rawKey, keys, enc) {
  const dbKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(keys.dbIv) }, dbKey, enc);
  const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The SQLite file's bytes for an enrolled username; throws Error('not-enrolled') for anyone else.
 * keys: { v, salt, iter, dbIv, wrapped: [{ iv, ct }] }; enc: the bytes of db.bin.
 */
export async function unlock(username, keys, enc) {
  return decryptDatabase(await unwrapKey(username, keys), keys, enc);
}
