// Golden tests for quote flags against samples/quotes/*/expected.json
import * as fs from 'node:fs';
import * as path from 'node:path';
import { flagQuote, type FlagContext } from '../src/quote-flags/rules.js';
import type { ExtractedQuote, TaxConfig } from '@eventpilot/shared';

const SAMPLES_DIR = path.resolve(__dirname, '../../../samples');
const QUOTES_DIR = path.join(SAMPLES_DIR, 'quotes');
const taxConfig: TaxConfig = JSON.parse(
  fs.readFileSync(path.join(SAMPLES_DIR, 'tax-rules.json'), 'utf-8'),
);

interface QuoteGoldenFixture {
  readonly _note: string;
  readonly quoteId: string;
  readonly extracted: ExtractedQuote;
  readonly expectedFlags: readonly string[];
}

describe('golden quote flags tests against samples/quotes', () => {
  const quoteDirs = fs
    .readdirSync(QUOTES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  it('found all 3 sample quote directories', () => {
    expect(quoteDirs).toHaveLength(3);
    expect(quoteDirs).toContain('quote-1-royal-caterers');
    expect(quoteDirs).toContain('quote-2-lakeview-banquets');
    expect(quoteDirs).toContain('quote-3-palace-flavours');
  });

  for (const dirName of quoteDirs) {
    describe(dirName, () => {
      const fixturePath = path.join(QUOTES_DIR, dirName, 'expected.json');
      const fixture: QuoteGoldenFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

      it(`flags match expected.json rules`, () => {
        const context: FlagContext = {
          taxConfig,
          guestCount: 350,
          quoteId: fixture.quoteId,
          nowMs: new Date('2026-10-24T12:00:00Z').getTime(),
        };

        const flags = flagQuote(fixture.extracted, context);
        const ruleIds = flags.map((f) => f.ruleId);

        // Verify each expected flag was produced
        for (const expectedRule of fixture.expectedFlags) {
          expect(ruleIds).toContain(expectedRule);
        }

        // Verify every flag has valid structure
        for (const flag of flags) {
          expect(flag.id).toBeDefined();
          expect(flag.quoteId).toBe(fixture.quoteId);
          expect(['info', 'warning', 'critical']).toContain(flag.severity);
          expect(flag.message.length).toBeGreaterThan(0);
          expect(flag.explanation.length).toBeGreaterThan(0);
          expect(flag.source).toBe('deterministic');
        }
      });
    });
  }
});
