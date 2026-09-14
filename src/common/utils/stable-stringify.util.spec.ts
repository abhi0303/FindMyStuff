import { stableStringify } from './stable-stringify.util';

describe('stableStringify', () => {
  it('produces the same output regardless of key order', () => {
    const a = stableStringify({ name: 'Passport', tags: ['a', 'b'] });
    const b = stableStringify({ tags: ['a', 'b'], name: 'Passport' });
    expect(a).toBe(b);
  });

  it('sorts keys at every nesting level, not just the top', () => {
    const a = stableStringify({ outer: { z: 1, a: 2 } });
    const b = stableStringify({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it('is sensitive to actually different values', () => {
    const a = stableStringify({ name: 'Passport' });
    const b = stableStringify({ name: 'Different' });
    expect(a).not.toBe(b);
  });

  it('preserves array order (arrays are not sorted, only object keys)', () => {
    const a = stableStringify({ tags: ['a', 'b'] });
    const b = stableStringify({ tags: ['b', 'a'] });
    expect(a).not.toBe(b);
  });

  it('handles null and undefined without throwing', () => {
    expect(() => stableStringify({ a: null, b: undefined })).not.toThrow();
  });
});
