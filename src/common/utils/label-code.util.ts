import { randomBytes } from 'node:crypto';

// Crockford-ish alphabet: no I, L, O, U — so a code read off a printed sticker
// cannot be mistyped as a similar-looking character.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Short human-typeable code for a storage QR sticker, e.g. "FMS-7K3QX2". */
export const generateLabelCode = (length = 6): string => {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `FMS-${code}`;
};
