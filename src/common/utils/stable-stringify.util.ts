/**
 * JSON.stringify with object keys sorted at every level, so two logically
 * identical request bodies hash to the same value regardless of key order —
 * used to detect whether an Idempotency-Key is being reused for the exact
 * same operation or (a client bug) a different one.
 */
export const stableStringify = (value: unknown): string => {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input !== null && typeof input === 'object') {
      return Object.keys(input as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sort((input as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return input;
  };

  return JSON.stringify(sort(value));
};
