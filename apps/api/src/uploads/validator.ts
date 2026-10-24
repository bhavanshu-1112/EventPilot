/**
 * Upload pipeline with magic-byte verification, file size enforcement,
 * and EXIF metadata stripping using sharp.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

export const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

export type AllowedMimeType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

export interface VerifiedFile {
  originalFilename: string;
  storageFilename: string;
  storagePath: string;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  contentHash: string;
  cleanedBuffer: Buffer;
}

function isPdf(b: Buffer): boolean {
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
}

function isPng(b: Buffer): boolean {
  return (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

function isJpeg(b: Buffer): boolean {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function isWebp(b: Buffer): boolean {
  return (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  );
}

/**
 * Detect file type by examining magic bytes at the beginning of the buffer.
 * Ignores user-provided Content-Type and filename extensions.
 */
export function detectMagicBytes(buffer: Buffer): { mime: AllowedMimeType; ext: string } | null {
  if (buffer.length < 12) return null;
  if (isPdf(buffer)) return { mime: 'application/pdf', ext: 'pdf' };
  if (isPng(buffer)) return { mime: 'image/png', ext: 'png' };
  if (isJpeg(buffer)) return { mime: 'image/jpeg', ext: 'jpg' };
  if (isWebp(buffer)) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export interface ProcessUploadOptions {
  originalFilename: string;
  buffer: Buffer;
  targetDir: string;
  category?: 'document' | 'image';
}

function validateCategory(
  category: 'document' | 'image' | undefined,
  isImage: boolean,
  mime: AllowedMimeType,
): void {
  if (category === 'image' && !isImage) {
    throw new Error('REJECTED_TYPE: Expected an image file (PNG, JPEG, WebP).');
  }
  if (category === 'document' && mime !== 'application/pdf') {
    throw new Error('REJECTED_TYPE: Expected a PDF document.');
  }
}

async function sanitizeImageBuffer(buffer: Buffer, mime: AllowedMimeType): Promise<Buffer> {
  try {
    const pipeline = sharp(buffer).rotate();
    if (mime === 'image/jpeg') return await pipeline.jpeg({ quality: 85 }).toBuffer();
    if (mime === 'image/png') return await pipeline.png({ compressionLevel: 8 }).toBuffer();
    return await pipeline.webp({ quality: 85 }).toBuffer();
  } catch {
    throw new Error('REJECTED_CORRUPT: Failed to decode and sanitize image.');
  }
}

function persistFile(
  targetDir: string,
  ext: string,
  buffer: Buffer,
): { storageFilename: string; storagePath: string; contentHash: string } {
  const storageFilename = `${crypto.randomUUID()}.${ext}`;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const storagePath = path.join(targetDir, storageFilename);
  fs.writeFileSync(storagePath, buffer);
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  return { storageFilename, storagePath, contentHash };
}

/**
 * Validate, sanitize, and store an uploaded file.
 * Throws specific errors for invalid magic bytes, size limits, or corrupted files.
 */
export async function processUpload(options: ProcessUploadOptions): Promise<VerifiedFile> {
  const { originalFilename, buffer, targetDir, category } = options;

  const detected = detectMagicBytes(buffer);
  if (!detected) {
    throw new Error(
      'REJECTED_MAGIC_BYTES: File content does not match allowed magic bytes (PDF, PNG, JPEG, WebP).',
    );
  }

  const isImage = detected.mime.startsWith('image/');
  validateCategory(category, isImage, detected.mime);

  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;
  if (buffer.length > maxSize) {
    const maxMb = maxSize / (1024 * 1024);
    throw new Error(`REJECTED_SIZE: File size exceeds ${String(maxMb)} MB limit.`);
  }

  const cleanedBuffer = isImage ? await sanitizeImageBuffer(buffer, detected.mime) : buffer;
  const stored = persistFile(targetDir, detected.ext, cleanedBuffer);

  return {
    originalFilename,
    storageFilename: stored.storageFilename,
    storagePath: stored.storagePath,
    mimeType: detected.mime,
    sizeBytes: cleanedBuffer.length,
    contentHash: stored.contentHash,
    cleanedBuffer,
  };
}
