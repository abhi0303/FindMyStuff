-- Search support: fuzzy matching for typos/partial words, full-text for phrases.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- array_to_string() is only STABLE, so the search document is wrapped in an
-- explicitly IMMUTABLE function to make it indexable. text[] -> text is
-- genuinely deterministic here, so the declaration is safe.
CREATE OR REPLACE FUNCTION fms_item_document(
  item_name text,
  item_aliases text[],
  item_tags text[],
  item_category text,
  item_description text
) RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT setweight(to_tsvector('simple', coalesce(item_name, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(array_to_string(item_aliases, ' '), '')), 'A')
      || setweight(to_tsvector('simple', coalesce(array_to_string(item_tags, ' '), '')), 'B')
      || setweight(to_tsvector('simple', coalesce(item_category, '')), 'B')
      || setweight(to_tsvector('simple', coalesce(item_description, '')), 'C')
$$;

-- "almira" should still find "Almirah"; "charg" should find "Charger".
CREATE INDEX "items_name_trgm_idx" ON "items" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "storages_name_trgm_idx" ON "storages" USING GIN ("name" gin_trgm_ops);

-- Tag / alias containment lookups.
CREATE INDEX "items_tags_idx" ON "items" USING GIN ("tags");
CREATE INDEX "items_aliases_idx" ON "items" USING GIN ("aliases");

-- Weighted full-text: name and aliases matter most, description least.
CREATE INDEX "items_fts_idx" ON "items" USING GIN (
  fms_item_document("name", "aliases", "tags", "category", "description")
);
