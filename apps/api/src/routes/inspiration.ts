import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import { z } from 'zod';
import { AssetRepository } from '../db/repositories/asset.repository.js';
import { BomRepository } from '../db/repositories/bom.repository.js';
import { createAuthHook, getAuthEvent } from '../auth/middleware.js';
import { processUpload } from '../uploads/validator.js';
import { loadPriceCatalog, priceBomItem, computeBomTotalMinor } from '../services/bom.service.js';
import { analyzeInspirationSchema, type AnalyzeInspirationPayload } from '@eventpilot/shared';
import { wrapUntrustedData } from '../llm/injection-defense.js';
import type { LlmClient } from '../llm/types.js';
import type { DbClient } from '../db/client.js';

const PatchTierSchema = z.object({
  tier: z.enum(['save', 'standard', 'splurge']),
});

async function processInspirationAnalysis(
  llmClient: LlmClient,
  bomRepo: BomRepository,
  eventId: string,
  altText: string | null,
) {
  const llmRes = await llmClient.callTool<AnalyzeInspirationPayload>({
    systemPrompt:
      'You are an elite event stylist and scenographer. Analyze visual themes and output an itemized bill of materials (BOM).',
    userPrompt: wrapUntrustedData(
      `Theme inspiration image: ${altText ?? 'Destination celebration visual concept'}`,
    ),
    tool: {
      name: 'analyze_inspiration',
      description:
        'Extract stylistic theme, color palette, and bill of materials from visual inspiration',
      schema: analyzeInspirationSchema,
    },
    purpose: 'analyze_inspiration',
    eventId,
  });

  const catalog = loadPriceCatalog();
  const pricedItems = llmRes.data.bom.map((item) => priceBomItem(item, catalog));
  const savedBom = await bomRepo.setBomItems(eventId, pricedItems);
  const totalMinor = computeBomTotalMinor(savedBom);

  return {
    vision: llmRes.data,
    bom: savedBom,
    totalMinor,
  };
}

export function createInspirationRoutes(
  db: DbClient,
  llmClient?: LlmClient,
  uploadDir?: string,
): FastifyPluginAsync {
  const assetRepo = new AssetRepository(db);
  const bomRepo = new BomRepository(db);
  const requireAuth = createAuthHook(db);
  const targetDir = uploadDir ?? path.resolve(process.cwd(), 'uploads', 'inspiration');

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/events/:id/inspiration - Upload inspiration image & generate priced BOM
    app.post(
      '/api/v1/events/:id/inspiration',
      { preHandler: [requireAuth] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { eventId } = getAuthEvent(request);

        if (!request.isMultipart()) {
          return reply.status(400).send({
            error: {
              code: 'BAD_REQUEST',
              message: 'Request must be multipart/form-data with an image file',
              requestId: request.id,
            },
          });
        }

        const data = await request.file();
        if (!data) {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'No file uploaded', requestId: request.id },
          });
        }

        const buffer = await data.toBuffer();
        const altTextField =
          (data.fields['altText'] as { value?: string } | undefined)?.value ?? null;

        try {
          const verified = await processUpload({
            originalFilename: data.filename,
            buffer,
            targetDir,
            category: 'image',
          });

          const asset = await assetRepo.create(eventId, {
            originalFilename: verified.originalFilename,
            storagePath: verified.storagePath,
            mimeType: verified.mimeType,
            sizeBytes: verified.sizeBytes,
            contentHash: verified.contentHash,
            altText: altTextField,
          });

          let visionData = null;
          let bomItems = null;
          let bomTotalMinor = 0;

          if (llmClient) {
            const analysis = await processInspirationAnalysis(
              llmClient,
              bomRepo,
              eventId,
              altTextField,
            );
            visionData = analysis.vision;
            bomItems = analysis.bom;
            bomTotalMinor = analysis.totalMinor;
          }

          return reply.status(201).send({
            asset: {
              id: asset.id,
              originalFilename: asset.original_filename,
              mimeType: asset.mime_type,
              sizeBytes: asset.size_bytes,
              contentHash: asset.content_hash,
              altText: asset.alt_text,
              createdAt: asset.created_at,
            },
            vision: visionData,
            bom: bomItems,
            totalMinor: bomTotalMinor,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Image upload failed';
          return reply.status(400).send({
            error: { code: 'UPLOAD_REJECTED', message, requestId: request.id },
          });
        }
      },
    );

    // GET /api/v1/events/:id/inspiration - List inspiration assets
    app.get(
      '/api/v1/events/:id/inspiration',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { eventId } = getAuthEvent(request);
        const assets = await assetRepo.getAssets(eventId);
        return reply.send({
          assets: assets.map((a) => ({
            id: a.id,
            originalFilename: a.original_filename,
            mimeType: a.mime_type,
            sizeBytes: a.size_bytes,
            contentHash: a.content_hash,
            altText: a.alt_text,
            createdAt: a.created_at,
          })),
        });
      },
    );

    // GET /api/v1/events/:id/bom - Retrieve Bill of Materials with tiers and total
    app.get('/api/v1/events/:id/bom', { preHandler: [requireAuth] }, async (request, reply) => {
      const { eventId } = getAuthEvent(request);
      const items = await bomRepo.getBomItems(eventId);
      const totalMinor = computeBomTotalMinor(items);

      return reply.send({
        items: items.map((i) => ({
          id: i.id,
          catalogKey: i.catalog_key,
          category: i.category,
          label: i.label,
          quantity: i.quantity,
          unit: i.unit,
          selectedTier: i.selected_tier,
          tiers: i.tiers.map((t) => ({
            id: t.id,
            tier: t.tier,
            name: t.name,
            priceMinor: Number(t.price_minor),
            description: t.description,
          })),
        })),
        totalMinor,
      });
    });

    // PATCH /api/v1/events/:id/bom/:itemId/tier - Update selected tier for a BOM item
    app.patch(
      '/api/v1/events/:id/bom/:itemId/tier',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { itemId } = request.params as { itemId: string };
        const parsed = PatchTierSchema.safeParse(request.body);

        if (!parsed.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid tier selection. Expected save, standard, or splurge.',
              requestId: request.id,
            },
          });
        }

        const { eventId } = getAuthEvent(request);
        const updated = await bomRepo.updateSelectedTier(eventId, itemId, parsed.data.tier);

        if (!updated) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'BOM item not found', requestId: request.id },
          });
        }

        const allItems = await bomRepo.getBomItems(eventId);
        const newTotalMinor = computeBomTotalMinor(allItems);

        return reply.send({
          item: updated,
          totalMinor: newTotalMinor,
        });
      },
    );
  };
}
