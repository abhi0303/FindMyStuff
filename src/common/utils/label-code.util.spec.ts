import { generateLabelCode } from './label-code.util';

describe('generateLabelCode', () => {
  it('produces a prefixed code of the requested length', () => {
    const code = generateLabelCode(6);
    expect(code).toMatch(/^FMS-[0-9A-Z]{6}$/);
  });

  it('never uses characters that are easy to misread on a printed sticker', () => {
    const codes = Array.from({ length: 200 }, () => generateLabelCode(8));
    for (const code of codes) {
      expect(code.slice(4)).not.toMatch(/[ILOU]/);
    }
  });

  it('does not repeat itself in practice', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateLabelCode(6)));
    expect(codes.size).toBeGreaterThan(495);
  });
});
