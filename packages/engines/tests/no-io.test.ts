/**
 * Guard test: ensure engines package has no I/O imports.
 * Engines must be pure — no fs, http, net, database, or other I/O modules.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ENGINES_SRC = path.resolve(__dirname, '../src');

// Patterns that indicate I/O imports
const FORBIDDEN_PATTERNS = [
  /import\s.*from\s+['"]node:fs/,
  /import\s.*from\s+['"]fs['"]/,
  /import\s.*from\s+['"]node:http/,
  /import\s.*from\s+['"]http['"]/,
  /import\s.*from\s+['"]node:https/,
  /import\s.*from\s+['"]https['"]/,
  /import\s.*from\s+['"]node:net/,
  /import\s.*from\s+['"]net['"]/,
  /import\s.*from\s+['"]node:child_process/,
  /import\s.*from\s+['"]child_process['"]/,
  /import\s.*from\s+['"]pg['"]/,
  /import\s.*from\s+['"]kysely['"]/,
  /import\s.*from\s+['"]ioredis['"]/,
  /import\s.*from\s+['"]redis['"]/,
  /import\s.*from\s+['"]fastify['"]/,
  /import\s.*from\s+['"]express['"]/,
  /require\s*\(\s*['"]node:fs/,
  /require\s*\(\s*['"]fs['"]/,
  /\bfetch\s*\(/,
  /\bDate\.now\s*\(/,
  /new\s+Date\s*\(\s*\)/,
  /\bprocess\.env\b/,
];

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('engines package purity', () => {
  const tsFiles = getAllTsFiles(ENGINES_SRC);

  it('has .ts source files to check', () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of tsFiles) {
    const relPath = path.relative(ENGINES_SRC, filePath);

    it(`${relPath} has no I/O imports or impure calls`, () => {
      let content = fs.readFileSync(filePath, 'utf-8');
      // Strip block comments and single-line comments to avoid matching pattern documentation
      content = content.replace(/\/\*[\s\S]*?\*\//g, '');
      const lines = content.split('\n');

      const violations: string[] = [];

      for (const [lineIdx, rawLine] of lines.entries()) {
        const line = rawLine.replace(/\/\/.*$/, '').trim();
        if (!line) continue;
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`  Line ${String(lineIdx + 1)}: ${line} [matched ${pattern.source}]`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }
});
