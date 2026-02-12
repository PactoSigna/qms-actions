import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildDocumentIndex } from '../src/parser.js';
import { buildRiskMatrix, renderRiskMatrixMarkdown } from '../src/reports/risk-matrix.js';

const DEVICE_ROOT = join(__dirname, 'fixtures', 'device');

describe('buildRiskMatrix', () => {
  it('builds risk matrix from device documents', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const matrix = buildRiskMatrix(index);

    expect(matrix).not.toBeNull();
    expect(matrix!.risks.length).toBeGreaterThan(0);
    expect(matrix!.summary.total).toBeGreaterThan(0);
  });

  it('calculates inherent risk correctly', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const matrix = buildRiskMatrix(index)!;

    // RISK-SW-001: severity=4, probability=3
    const riskSw001 = matrix.risks.find((r) => r.id === 'RISK-SW-001');
    expect(riskSw001).toBeDefined();
    expect(riskSw001!.severity).toBe(4);
    expect(riskSw001!.probability).toBe(3);

    // Inherent grid should have a count at [prob-1][sev-1] = [2][3]
    expect(matrix.inherent[2][3]).toBe(1);
  });

  it('calculates residual risk correctly', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const matrix = buildRiskMatrix(index)!;

    const riskSw001 = matrix.risks.find((r) => r.id === 'RISK-SW-001');
    expect(riskSw001!.residualSeverity).toBe(4);
    expect(riskSw001!.residualProbability).toBe(1);

    // Residual: severity=4, probability=1 → acceptable
    expect(riskSw001!.acceptability).toBe('acceptable');
  });

  it('determines acceptability status', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const matrix = buildRiskMatrix(index)!;

    // With residual prob=1, sev=4 → should be acceptable
    expect(matrix.summary.acceptable).toBeGreaterThanOrEqual(1);
  });

  it('returns null when no risk documents exist', () => {
    const qmsRoot = join(__dirname, 'fixtures', 'qms');
    const index = buildDocumentIndex('', qmsRoot);
    const matrix = buildRiskMatrix(index);
    expect(matrix).toBeNull();
  });
});

describe('renderRiskMatrixMarkdown', () => {
  it('renders a markdown table', () => {
    const index = buildDocumentIndex('', DEVICE_ROOT);
    const matrix = buildRiskMatrix(index)!;
    const md = renderRiskMatrixMarkdown(matrix);

    expect(md).toContain('Risk Summary');
    expect(md).toContain('Inherent Risk Grid');
    expect(md).toContain('Residual Risk Grid');
    expect(md).toContain('RISK-SW-001');
  });
});
