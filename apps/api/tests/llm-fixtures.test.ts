import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  extractQuoteSchema,
  type ExtractQuotePayload,
  type TaxConfig,
  type ExtractedQuote,
} from '@eventpilot/shared';
import { flagQuote, type FlagContext } from '@eventpilot/engines';
import { extractTextFromPdf } from '../src/uploads/pdf-extractor.js';
import { FixtureClient } from '../src/llm/fixture-client.js';
import { wrapUntrustedData } from '../src/llm/injection-defense.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLES_DIR = path.resolve(__dirname, '../../../samples');
const QUOTES_DIR = path.join(SAMPLES_DIR, 'quotes');
const taxConfig: TaxConfig = JSON.parse(
  fs.readFileSync(path.join(SAMPLES_DIR, 'tax-rules.json'), 'utf-8'),
);

interface ExpectedFixture {
  _note: string;
  quoteId: string;
  extracted: ExtractQuotePayload;
  expectedFlags: string[];
}

describe('LLM Fixtures and Contract Verification', () => {
  const quoteCases = [
    { dir: 'quote-1-royal-caterers', file: 'quote.pdf' },
    { dir: 'quote-2-lakeview-banquets', file: 'quote.pdf' },
    { dir: 'quote-3-palace-flavours', file: 'quote.pdf' },
  ];

  it('verifies all 3 sample PDFs extract text cleanly using pdf-parse', async () => {
    for (const qc of quoteCases) {
      const pdfPath = path.join(QUOTES_DIR, qc.dir, qc.file);
      expect(fs.existsSync(pdfPath)).toBe(true);

      const buffer = fs.readFileSync(pdfPath);
      const extractedText = await extractTextFromPdf(buffer);

      expect(extractedText.text.length).toBeGreaterThan(50);
      expect(extractedText.numPages).toBeGreaterThanOrEqual(1);
    }
  });

  it('extracts correctly in fixture mode and matches expected.json', async () => {
    const fixtureClient = new FixtureClient();

    for (const qc of quoteCases) {
      const expectedPath = path.join(QUOTES_DIR, qc.dir, 'expected.json');
      const expectedData = JSON.parse(fs.readFileSync(expectedPath, 'utf-8')) as ExpectedFixture;

      const pdfPath = path.join(QUOTES_DIR, qc.dir, qc.file);
      const buffer = fs.readFileSync(pdfPath);
      const pdfText = await extractTextFromPdf(buffer);
      const prompt = wrapUntrustedData(pdfText.text);

      const llmRes = await fixtureClient.callTool<ExtractQuotePayload>({
        systemPrompt: 'Extract catering quote details',
        userPrompt: prompt,
        tool: {
          name: 'extract_quote',
          description: 'Extract quote details',
          schema: extractQuoteSchema,
        },
        purpose: 'extract_quote',
      });

      const extracted = llmRes.data;
      expect(extracted.vendorName).toBe(expectedData.extracted.vendorName);
      expect(extracted.category).toBe(expectedData.extracted.category);
      expect(extracted.currency).toBe(expectedData.extracted.currency);
      expect(extracted.lineItems.length).toBe(expectedData.extracted.lineItems.length);

      // Verify domain flags generated against expected flags
      const domainQuote: ExtractedQuote = {
        vendorName: extracted.vendorName,
        category: extracted.category,
        currency: extracted.currency,
        lineItems: extracted.lineItems.map((li, idx) => ({
          id: `item-${String(idx + 1)}`,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unitPriceMinor: li.unitPriceMinor,
          totalMinor: li.totalMinor,
          taxIncluded: li.taxIncluded,
        })),
        inclusions: extracted.inclusions,
        exclusions: extracted.exclusions,
        fees: extracted.fees,
        validUntil: extracted.validUntil,
        cancellationTerms: extracted.cancellationTerms,
        statedTotalMinor: extracted.statedTotalMinor,
        confidence: extracted.confidence,
      };

      const context: FlagContext = {
        taxConfig,
        guestCount: 350,
        quoteId: expectedData.quoteId,
        nowMs: new Date('2026-10-24T12:00:00Z').getTime(),
      };

      const flags = flagQuote(domainQuote, context);
      const flagRuleIds = flags.map((f) => f.ruleId);

      for (const expectedFlag of expectedData.expectedFlags) {
        expect(flagRuleIds).toContain(expectedFlag);
      }
    }
  });

  it('validates fixtures strictly against Zod schemas and rejects malformed payloads', async () => {
    const invalidClient = new FixtureClient({
      extract_quote_1: {
        vendorName: 'Bad Vendor',
        // missing required fields: category, confidence, lineItems
      },
    });

    await expect(
      invalidClient.callTool({
        systemPrompt: 'test',
        userPrompt: 'RC-2025',
        tool: {
          name: 'extract_quote',
          description: 'Extract',
          schema: extractQuoteSchema,
        },
        purpose: 'extract_quote',
      }),
    ).rejects.toThrow();
  });
});
