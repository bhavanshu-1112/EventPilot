/**
 * Event access token generation and hashing utilities.
 * 128-bit cryptographically secure random tokens stored as SHA-256 hashes.
 */
import crypto from 'node:crypto';

/**
 * Generate a new 128-bit random access token formatted as a 32-character hex string.
 */
export function generateEventToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Compute SHA-256 hash of an event access token for secure lookup and storage at rest.
 */
export function hashEventToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}
