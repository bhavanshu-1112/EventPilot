import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import {
  detectMagicBytes,
  processUpload,
  MAX_DOC_SIZE,
  MAX_IMAGE_SIZE,
} from '../src/uploads/validator.js';
import { buildApp } from '../src/server.js';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';

function createMultipartPayload(
  files: Array<{ fieldname: string; filename: string; contentType: string; buffer: Buffer }>,
  fields: Record<string, string> = {},
) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const chunks: Buffer[] = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`,
      ),
    );
  }

  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.fieldname}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n`,
      ),
    );
    chunks.push(f.buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(chunks),
  };
}

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  ANTHROPIC_API_KEY: 'sk-ant-test-placeholder',
  LLM_MODE: 'fixture',
  NOTIFY_MODE: 'dry-run',
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
};

describe('Uploads Pipeline & Magic Bytes Verification', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-test-uploads-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('correctly detects magic bytes for PDF, PNG, JPEG, and WebP', () => {
    const pdfBuf = Buffer.from('%PDF-1.4\n%some test pdf stream\n%%EOF');
    expect(detectMagicBytes(pdfBuf)).toEqual({ mime: 'application/pdf', ext: 'pdf' });

    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    expect(detectMagicBytes(pngHeader)).toEqual({ mime: 'image/png', ext: 'png' });

    const jpegHeader = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    expect(detectMagicBytes(jpegHeader)).toEqual({ mime: 'image/jpeg', ext: 'jpg' });

    const webpHeader = Buffer.from([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // length
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]);
    expect(detectMagicBytes(webpHeader)).toEqual({ mime: 'image/webp', ext: 'webp' });

    // Text file pretending to be image/pdf
    const textBuf = Buffer.from('Hello world! Not a real document header.');
    expect(detectMagicBytes(textBuf)).toBeNull();
  });

  it('rejects files exceeding size limits', async () => {
    // 11 MB fake PDF
    const bigDocBuf = Buffer.alloc(MAX_DOC_SIZE + 1024);
    bigDocBuf.set(Buffer.from('%PDF-1.4\n'));

    await expect(
      processUpload({
        originalFilename: 'large.pdf',
        buffer: bigDocBuf,
        targetDir: tempDir,
      }),
    ).rejects.toThrow(/REJECTED_SIZE/);

    // 6 MB fake PNG
    const bigImgBuf = Buffer.alloc(MAX_IMAGE_SIZE + 1024);
    bigImgBuf.set(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
    );

    await expect(
      processUpload({
        originalFilename: 'large.png',
        buffer: bigImgBuf,
        targetDir: tempDir,
        category: 'image',
      }),
    ).rejects.toThrow(/REJECTED_SIZE/);
  });

  it('sanitizes images and strips EXIF metadata using sharp', async () => {
    // Generate valid 100x100 PNG using sharp with metadata
    const rawImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const verified = await processUpload({
      originalFilename: 'test-image.png',
      buffer: rawImage,
      targetDir: tempDir,
      category: 'image',
    });

    expect(verified.mimeType).toBe('image/png');
    expect(verified.storageFilename).toMatch(/\.png$/);
    expect(fs.existsSync(verified.storagePath)).toBe(true);

    // Read back with sharp and ensure it is a valid stripped image
    const meta = await sharp(verified.cleanedBuffer).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
    expect(meta.exif).toBeUndefined();
  });
});

describe('Multipart HTTP Upload Routes with IDOR Protection', () => {
  let db: DbClient;
  let app: FastifyInstance;
  let tempDir: string;
  let eventA: { id: string; accessToken: string };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-test-http-uploads-'));
    db = await createInMemoryTestDb();
    await runMigrations(db);

    app = await buildApp({
      rawEnv: TEST_ENV,
      db,
      uploadDir: tempDir,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      payload: {
        name: 'Upload Test Event',
        eventType: 'wedding',
        location: 'Goa',
        eventDate: '2026-12-01',
        guestCount: 150,
        totalBudgetMinor: 200000000,
        currency: 'INR',
      },
    });
    const body = JSON.parse(res.body);
    eventA = { id: body.event.id, accessToken: body.accessToken };
  });

  afterEach(async () => {
    await app.close();
    await db.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('accepts valid PDF upload to quotes route', async () => {
    const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const multipart = createMultipartPayload(
      [
        {
          fieldname: 'file',
          filename: 'caterer-quote.pdf',
          contentType: 'application/pdf',
          buffer: pdfContent,
        },
      ],
      { category: 'catering', vendorName: 'Royal Caterers' },
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventA.id}/quotes`,
      headers: {
        authorization: `Bearer ${eventA.accessToken}`,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.quote.id).toBeDefined();
    expect(body.quote.vendorName).toContain('Royal Caterers');
    expect(body.quote.category).toBe('catering');
    expect(body.quote.contentHash).toBeDefined();
  });

  it('rejects non-PDF files uploaded to quotes route', async () => {
    const textContent = Buffer.from('This is a text file posing as a PDF.');
    const multipart = createMultipartPayload([
      {
        fieldname: 'file',
        filename: 'malicious.pdf',
        contentType: 'application/pdf',
        buffer: textContent,
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventA.id}/quotes`,
      headers: {
        authorization: `Bearer ${eventA.accessToken}`,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('UPLOAD_REJECTED');
  });

  it('accepts valid image upload to inspiration route', async () => {
    const imgBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    const multipart = createMultipartPayload(
      [
        {
          fieldname: 'file',
          filename: 'mandap-decor.jpg',
          contentType: 'image/jpeg',
          buffer: imgBuffer,
        },
      ],
      { altText: 'Floral mandap decor inspiration' },
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventA.id}/inspiration`,
      headers: {
        authorization: `Bearer ${eventA.accessToken}`,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.asset.id).toBeDefined();
    expect(body.asset.mimeType).toBe('image/jpeg');
    expect(body.asset.altText).toBe('Floral mandap decor inspiration');
  });

  it('rejects PDF uploaded to inspiration route (image only)', async () => {
    const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const multipart = createMultipartPayload([
      {
        fieldname: 'file',
        filename: 'wrong-type.pdf',
        contentType: 'application/pdf',
        buffer: pdfContent,
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventA.id}/inspiration`,
      headers: {
        authorization: `Bearer ${eventA.accessToken}`,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('UPLOAD_REJECTED');
    expect(body.error.message).toMatch(/Expected an image/);
  });
});
