/**
 * Where image bytes physically live. The database only ever holds a small
 * `media` row pointing at a key inside one of these.
 *
 * Each row records the driver that wrote it, so rows written by different
 * drivers can coexist — switching MEDIA_DRIVER changes where NEW uploads go
 * without breaking reads of older ones.
 */
export interface MediaStorage {
  /** Stored verbatim in `media.driver`. */
  readonly driver: string;

  /**
   * Writes the bytes and returns the key to persist in the row. The returned
   * key must be enough, on its own, to read the object back later — so a
   * driver that adds a prefix includes it here rather than re-deriving it at
   * read time (a later prefix change would otherwise orphan every old row).
   */
  put(relativeKey: string, body: Buffer, contentType: string): Promise<string>;

  /** The bytes, or null when the object does not exist. Other failures throw. */
  get(key: string): Promise<Buffer | null>;
}

export const MEDIA_STORAGES = Symbol('MEDIA_STORAGES');
