import type { DbClient } from '../client.js';
import type { InspirationAssetRow } from '../schema.js';

export interface CreateAssetInput {
  id?: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  altText?: string | null;
}

export class AssetRepository {
  constructor(private readonly db: DbClient) {}

  async create(eventId: string, input: CreateAssetInput): Promise<InspirationAssetRow> {
    return this.db
      .insertInto('inspiration_assets')
      .values({
        id: input.id ?? crypto.randomUUID(),
        event_id: eventId,
        original_filename: input.originalFilename,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        content_hash: input.contentHash,
        alt_text: input.altText ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getAssets(eventId: string): Promise<InspirationAssetRow[]> {
    return this.db
      .selectFrom('inspiration_assets')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async findByHash(eventId: string, contentHash: string): Promise<InspirationAssetRow | undefined> {
    return this.db
      .selectFrom('inspiration_assets')
      .selectAll()
      .where('event_id', '=', eventId)
      .where('content_hash', '=', contentHash)
      .executeTakeFirst();
  }
}
