import { Injectable } from '@nestjs/common';
import { ItemStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';

/** Below this, a trigram match is noise rather than a typo. */
const SIMILARITY_THRESHOLD = 0.25;

interface ItemSearchRow {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  aliases: string[];
  quantity: number;
  status: ItemStatus;
  updatedAt: Date;
  expiresAt: Date | null;
  storage_id: string | null;
  storage_name: string | null;
  storage_path: string | null;
  place_id: string;
  place_name: string;
  media_id: string | null;
  score: number;
  total: bigint;
}

interface StorageSearchRow {
  id: string;
  name: string;
  type: string;
  path: string;
  label_code: string;
  place_id: string;
  place_name: string;
  item_count: bigint;
  score: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The "where did I keep it" query. Combines weighted full-text (phrases,
   * multiple words) with trigram similarity (typos, partial words) so that
   * "almira", "charger" and "pass port" all find the right thing.
   */
  async search(userId: string, query: SearchQueryDto) {
    const [items, storages] = await Promise.all([
      this.searchItems(userId, query),
      query.includeStorages === false ? Promise.resolve([]) : this.searchStorages(userId, query),
    ]);

    return { query: query.q, ...items, storages };
  }

  /**
   * Builds a prefix tsquery so "medicin" matches "medicine" and "pass" matches
   * "passport" — which is what search-as-you-type needs. Input is stripped to
   * alphanumerics first, because to_tsquery throws on stray syntax characters.
   */
  private prefixQuery(term: string): string | null {
    const words = term
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);

    return words.length > 0 ? words.map((word) => `${word}:*`).join(' & ') : null;
  }

  private placeFilter(query: SearchQueryDto): Prisma.Sql {
    return query.placeId ? Prisma.sql`AND i."placeId" = ${query.placeId}::uuid` : Prisma.empty;
  }

  private async searchItems(userId: string, query: SearchQueryDto) {
    const archivedFilter = query.includeArchived
      ? Prisma.empty
      : Prisma.sql`AND i."status" NOT IN ('DISCARDED', 'CONSUMED')`;

    const prefix = this.prefixQuery(query.q);
    const tsQuery = prefix
      ? Prisma.sql`to_tsquery('simple', ${prefix})`
      : Prisma.sql`plainto_tsquery('simple', ${query.q})`;

    const rows = await this.prisma.$queryRaw<ItemSearchRow[]>`
      SELECT
        i."id",
        i."name",
        i."description",
        i."tags",
        i."aliases",
        i."quantity",
        i."status",
        i."updatedAt",
        i."expiresAt",
        s."id"   AS storage_id,
        s."name" AS storage_name,
        s."path" AS storage_path,
        p."id"   AS place_id,
        p."name" AS place_name,
        (
          SELECT im."mediaId" FROM "item_media" im
          WHERE im."itemId" = i."id"
          ORDER BY im."sortOrder" ASC
          LIMIT 1
        ) AS media_id,
        GREATEST(
          ts_rank(
            fms_item_document(i."name", i."aliases", i."tags", i."category", i."description"),
            ${tsQuery}
          ) * 4,
          similarity(i."name", ${query.q})
        ) AS score,
        COUNT(*) OVER() AS total
      FROM "items" i
      JOIN "place_members" m
        ON m."placeId" = i."placeId"
       AND m."userId" = ${userId}::uuid
       AND m."status" = 'ACTIVE'
      JOIN "places" p
        ON p."id" = i."placeId"
       AND p."deletedAt" IS NULL
      LEFT JOIN "storages" s ON s."id" = i."storageId"
      WHERE i."deletedAt" IS NULL
        -- PRIVATE items stay invisible to everyone but their owner
        AND (i."visibility" = 'SHARED' OR i."ownerId" = ${userId}::uuid)
        ${this.placeFilter(query)}
        ${archivedFilter}
        AND (
          fms_item_document(i."name", i."aliases", i."tags", i."category", i."description")
            @@ ${tsQuery}
          OR similarity(i."name", ${query.q}) > ${SIMILARITY_THRESHOLD}
          OR i."name" ILIKE ${`%${query.q}%`}
          OR EXISTS (
            SELECT 1 FROM unnest(i."aliases" || i."tags") AS alt
            WHERE alt ILIKE ${`%${query.q}%`}
          )
        )
      ORDER BY score DESC, i."updatedAt" DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const breadcrumbs = await this.resolveBreadcrumbs(
      rows.map((row) => ({ path: row.storage_path, name: row.storage_name, id: row.storage_id })),
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        tags: row.tags,
        aliases: row.aliases,
        quantity: row.quantity,
        status: row.status,
        expiresAt: row.expiresAt,
        updatedAt: row.updatedAt,
        mediaId: row.media_id,
        place: { id: row.place_id, name: row.place_name },
        storage: row.storage_id
          ? {
              id: row.storage_id,
              name: row.storage_name,
              // "Home › Bedroom › Almirah › Top shelf" — the actual answer
              // to "where did I keep it".
              breadcrumb: `${row.place_name} › ${breadcrumbs.get(row.storage_id) ?? row.storage_name}`,
            }
          : null,
        score: Number(row.score),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        hasNext: query.page * query.limit < total,
      },
    };
  }

  private async searchStorages(userId: string, query: SearchQueryDto): Promise<unknown[]> {
    const placeFilter = query.placeId
      ? Prisma.sql`AND s."placeId" = ${query.placeId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<StorageSearchRow[]>`
      SELECT
        s."id",
        s."name",
        s."type"::text AS type,
        s."path",
        s."labelCode" AS label_code,
        p."id"   AS place_id,
        p."name" AS place_name,
        (
          SELECT COUNT(*) FROM "items" it
          WHERE it."storageId" = s."id"
            AND it."deletedAt" IS NULL
            AND (it."visibility" = 'SHARED' OR it."ownerId" = ${userId}::uuid)
        ) AS item_count,
        similarity(s."name", ${query.q}) AS score
      FROM "storages" s
      JOIN "place_members" m
        ON m."placeId" = s."placeId"
       AND m."userId" = ${userId}::uuid
       AND m."status" = 'ACTIVE'
      JOIN "places" p
        ON p."id" = s."placeId"
       AND p."deletedAt" IS NULL
      WHERE s."deletedAt" IS NULL
        ${placeFilter}
        AND (
          s."name" ILIKE ${`%${query.q}%`}
          OR similarity(s."name", ${query.q}) > ${SIMILARITY_THRESHOLD}
          OR s."labelCode" = ${query.q.toUpperCase()}
        )
      ORDER BY score DESC, s."name" ASC
      LIMIT 10
    `;

    const breadcrumbs = await this.resolveBreadcrumbs(
      rows.map((row) => ({ path: row.path, name: row.name, id: row.id })),
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      labelCode: row.label_code,
      itemCount: Number(row.item_count),
      place: { id: row.place_id, name: row.place_name },
      breadcrumb: `${row.place_name} › ${breadcrumbs.get(row.id) ?? row.name}`,
    }));
  }

  /**
   * Turns materialised paths into readable breadcrumbs. Every ancestor across
   * every result row is fetched in a single query rather than per row.
   */
  private async resolveBreadcrumbs(
    rows: { path: string | null; name: string | null; id?: string | null }[],
  ): Promise<Map<string, string>> {
    const ancestorIds = new Set<string>();
    for (const row of rows) {
      if (!row.path) continue;
      for (const id of row.path.split('/')) ancestorIds.add(id);
    }

    const names = new Map<string, string>();
    if (ancestorIds.size > 0) {
      const ancestors = await this.prisma.storage.findMany({
        where: { id: { in: [...ancestorIds] } },
        select: { id: true, name: true },
      });
      for (const ancestor of ancestors) names.set(ancestor.id, ancestor.name);
    }

    const result = new Map<string, string>();
    for (const row of rows) {
      const key = row.id ?? null;
      if (!row.name) continue;
      const chain = row.path ? row.path.split('/').map((id) => names.get(id) ?? '?') : [];
      result.set(key ?? row.name, [...chain, row.name].join(' › '));
    }

    return result;
  }
}
