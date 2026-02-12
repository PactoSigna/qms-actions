import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildDocumentIndex } from '../src/parser.js';
import { validateFrontmatter } from '../src/validators/frontmatter.js';
import { validateLinks } from '../src/validators/links.js';
import { validateMarkdown } from '../src/validators/markdown.js';
import { validateTraceability } from '../src/validators/traceability.js';
import { loadConfig } from '../src/config.js';

const FIXTURES_ROOT = join(__dirname, 'fixtures');
const QMS_ROOT = join(FIXTURES_ROOT, 'qms');
const DEVICE_ROOT = join(FIXTURES_ROOT, 'device');

describe('validateFrontmatter', () => {
  it('detects missing required fields', () => {
    const index = buildDocumentIndex('', QMS_ROOT);
    const docs = Array.from(index.byId.values());
    const config = loadConfig('/nonexistent', 'qms');
    const warnings = validateFrontmatter(docs, index, config);

    // SOP-002 is missing 'status'
    const statusWarnings = warnings.filter(
      (w) => w.rule === 'frontmatter/required-fields' && w.file.includes('SOP-002')
    );
    expect(statusWarnings.length).toBeGreaterThan(0);
  });

  it('detects missing recommended fields', () => {
    const index = buildDocumentIndex('', QMS_ROOT);
    const docs = Array.from(index.byId.values());
    const config = loadConfig('/nonexistent', 'qms');
    const warnings = validateFrontmatter(docs, index, config);

    // SOP-002 is missing author, reviewers, approvers
    const optionalWarnings = warnings.filter(
      (w) => w.rule === 'frontmatter/optional-fields' && w.file.includes('SOP-002')
    );
    expect(optionalWarnings.length).toBeGreaterThanOrEqual(3);
  });

  it('reports no duplicates when IDs are unique', () => {
    const index = buildDocumentIndex('', QMS_ROOT);
    const docs = Array.from(index.byId.values());
    const config = loadConfig('/nonexistent', 'qms');
    const warnings = validateFrontmatter(docs, index, config);

    const dupeWarnings = warnings.filter((w) => w.rule === 'frontmatter/duplicate-id');
    expect(dupeWarnings.length).toBe(0);
  });
});

describe('validateLinks', () => {
  it('detects no broken links in valid device docs', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const docs = Array.from(index.byId.values());
    const warnings = validateLinks(docs, index);

    // All references in our fixtures should resolve
    const brokenLinks = warnings.filter((w) => w.rule === 'links/broken-reference');
    // PRS-001 → UN-001 exists, SRS-001 → PRS-001 exists, etc.
    expect(brokenLinks.length).toBe(0);
  });
});

describe('validateMarkdown', () => {
  it('validates heading structure', () => {
    const index = buildDocumentIndex('', QMS_ROOT);
    const docs = Array.from(index.byId.values());
    const warnings = validateMarkdown(docs);

    // Our fixture docs have proper heading structure
    const headingWarnings = warnings.filter((w) => w.rule === 'markdown/heading-structure');
    // Some minor title mismatches may appear, but no skipped levels
    const skippedLevels = headingWarnings.filter((w) => w.message.includes('Skipped'));
    expect(skippedLevels.length).toBe(0);
  });
});

describe('validateTraceability', () => {
  it('skips traceability for QMS repos', () => {
    const index = buildDocumentIndex('', QMS_ROOT);
    const docs = Array.from(index.byId.values());
    const config = loadConfig('/nonexistent', 'qms');
    const result = validateTraceability(docs, index, config);

    expect(result.warnings.length).toBe(0);
    expect(result.coverage.length).toBe(0);
  });

  it('detects missing requirement derivation', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const docs = Array.from(index.byId.values());
    const config = loadConfig('/nonexistent', 'device');
    const result = validateTraceability(docs, index, config);

    // SRS-002 has no derives_from link
    const derivationWarnings = result.warnings.filter(
      (w) => w.rule === 'traceability/requirement-derivation' && w.message.includes('SRS-002')
    );
    expect(derivationWarnings.length).toBeGreaterThan(0);
  });

  it('calculates traceability coverage', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const docs = Array.from(index.byId.values());
    const config = loadConfig('/nonexistent', 'device');
    const result = validateTraceability(docs, index, config);

    expect(result.coverage.length).toBeGreaterThan(0);

    // Product Requirement → User Need chain should be 100% (PRS-001 derives from UN-001)
    const prsToUn = result.coverage.find((c) => c.sourceType === 'product_requirement');
    expect(prsToUn).toBeDefined();
    expect(prsToUn!.coveragePercent).toBe(100);

    // Software Requirement → Product Requirement should be <100% (SRS-002 is orphan)
    const srsToReq = result.coverage.find((c) => c.sourceType === 'software_requirement');
    expect(srsToReq).toBeDefined();
    expect(srsToReq!.coveragePercent).toBeLessThan(100);
  });

  it('reports gaps for missing links', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const docs = Array.from(index.byId.values());
    const config = loadConfig('/nonexistent', 'device');
    const result = validateTraceability(docs, index, config);

    const srs002Gaps = result.gaps.filter((g) => g.documentId === 'SRS-002');
    expect(srs002Gaps.length).toBeGreaterThan(0);
  });
});
