import type { Document, DocumentIndex, RiskEntry, RiskMatrix } from '../types.js';
import { extractLinks } from '../parser.js';

type Acceptability = 'acceptable' | 'review_required' | 'unacceptable';

/**
 * Default ISO 14971 acceptability matrix (5x5).
 * Rows = probability (1-5), Columns = severity (1-5).
 */
const DEFAULT_ACCEPTABILITY: Acceptability[][] = [
  // Sev:  1            2            3                  4                5
  ['acceptable', 'acceptable', 'acceptable', 'acceptable', 'review_required'], // Prob 1 (Remote)
  ['acceptable', 'acceptable', 'acceptable', 'review_required', 'review_required'], // Prob 2 (Unlikely)
  ['acceptable', 'acceptable', 'review_required', 'review_required', 'unacceptable'], // Prob 3 (Possible)
  ['acceptable', 'review_required', 'review_required', 'unacceptable', 'unacceptable'], // Prob 4 (Likely)
  ['review_required', 'review_required', 'unacceptable', 'unacceptable', 'unacceptable'], // Prob 5 (Frequent)
];

/**
 * Extract risk assessment values from a risk document's frontmatter and body.
 */
function extractRiskValues(doc: Document): {
  severity: number;
  probability: number;
  residualSeverity?: number;
  residualProbability?: number;
} | null {
  // Try frontmatter first
  const fm = doc.frontmatter;
  if (fm.severity && fm.probability) {
    return {
      severity: Number(fm.severity),
      probability: Number(fm.probability),
      residualSeverity: fm['residual_severity'] ? Number(fm['residual_severity']) : undefined,
      residualProbability: fm['residual_probability']
        ? Number(fm['residual_probability'])
        : undefined,
    };
  }

  // Parse from body tables: | Severity | 4 (Critical) |
  const body = doc.body;
  const severityMatch = body.match(/\|\s*Severity\s*\|\s*(\d)/i);
  const probabilityMatch = body.match(/\|\s*Probability\s*\|\s*(\d)/i);
  const residualSeverityMatch = body.match(/\|\s*Residual\s*Severity\s*\|\s*(\d)/i);
  const residualProbabilityMatch = body.match(/\|\s*Residual\s*Probability\s*\|\s*(\d)/i);

  if (!severityMatch || !probabilityMatch) return null;

  return {
    severity: parseInt(severityMatch[1], 10),
    probability: parseInt(probabilityMatch[1], 10),
    residualSeverity: residualSeverityMatch ? parseInt(residualSeverityMatch[1], 10) : undefined,
    residualProbability: residualProbabilityMatch
      ? parseInt(residualProbabilityMatch[1], 10)
      : undefined,
  };
}

/**
 * Build the ISO 14971 risk matrix from risk documents.
 */
export function buildRiskMatrix(
  index: DocumentIndex,
  gridSize: number = 5
): RiskMatrix | null {
  const riskDocs = index.byType.get('risk') ?? [];
  if (riskDocs.length === 0) return null;

  const inherent = createGrid(gridSize);
  const residual = createGrid(gridSize);
  const risks: RiskEntry[] = [];

  let acceptable = 0;
  let reviewRequired = 0;
  let unacceptable = 0;

  for (const doc of riskDocs) {
    const values = extractRiskValues(doc);
    if (!values) continue;

    const { severity, probability, residualSeverity, residualProbability } = values;

    // Populate inherent risk grid
    if (probability >= 1 && probability <= gridSize && severity >= 1 && severity <= gridSize) {
      inherent[probability - 1][severity - 1]++;
    }

    // Populate residual risk grid
    const resSev = residualSeverity ?? severity;
    const resProb = residualProbability ?? probability;
    if (resProb >= 1 && resProb <= gridSize && resSev >= 1 && resSev <= gridSize) {
      residual[resProb - 1][resSev - 1]++;
    }

    // Determine acceptability from residual risk
    const acceptabilityStatus = getAcceptability(resProb, resSev);

    switch (acceptabilityStatus) {
      case 'acceptable':
        acceptable++;
        break;
      case 'review_required':
        reviewRequired++;
        break;
      case 'unacceptable':
        unacceptable++;
        break;
    }

    const links = extractLinks(doc);
    const mitigates = links.filter((l) => l.type === 'mitigates').map((l) => l.targetId);

    risks.push({
      id: doc.id,
      title: doc.title,
      severity,
      probability,
      residualSeverity,
      residualProbability,
      mitigates,
      acceptability: acceptabilityStatus,
    });
  }

  return {
    inherent,
    residual,
    acceptability: DEFAULT_ACCEPTABILITY,
    risks,
    summary: {
      total: risks.length,
      acceptable,
      reviewRequired,
      unacceptable,
    },
  };
}

function createGrid(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0) as number[]);
}

function getAcceptability(probability: number, severity: number): Acceptability {
  if (
    probability < 1 ||
    probability > 5 ||
    severity < 1 ||
    severity > 5
  ) {
    return 'review_required';
  }
  return DEFAULT_ACCEPTABILITY[probability - 1][severity - 1];
}

/**
 * Render risk matrix as a markdown table for PR comments.
 */
export function renderRiskMatrixMarkdown(matrix: RiskMatrix): string {
  const lines: string[] = [];

  lines.push('### Risk Summary (ISO 14971)');
  lines.push('');
  lines.push(
    `| Status | Count |`,
    `|--------|-------|`,
    `| Acceptable | ${matrix.summary.acceptable} |`,
    `| Review Required | ${matrix.summary.reviewRequired} |`,
    `| Unacceptable | ${matrix.summary.unacceptable} |`,
    `| **Total** | **${matrix.summary.total}** |`
  );
  lines.push('');

  // Inherent risk grid
  lines.push('#### Inherent Risk Grid');
  lines.push('');
  lines.push(renderGrid(matrix.inherent));
  lines.push('');

  // Residual risk grid
  lines.push('#### Residual Risk Grid');
  lines.push('');
  lines.push(renderGrid(matrix.residual));
  lines.push('');

  // Individual risks
  if (matrix.risks.length > 0) {
    lines.push('#### Risk Details');
    lines.push('');
    lines.push('| ID | Title | Inherent (S/P) | Residual (S/P) | Status |');
    lines.push('|----|-------|----------------|----------------|--------|');
    for (const risk of matrix.risks) {
      const inherent = `${risk.severity}/${risk.probability}`;
      const res = `${risk.residualSeverity ?? risk.severity}/${risk.residualProbability ?? risk.probability}`;
      lines.push(`| ${risk.id} | ${risk.title} | ${inherent} | ${res} | ${risk.acceptability} |`);
    }
  }

  return lines.join('\n');
}

function renderGrid(grid: number[][]): string {
  const probLabels = ['Remote', 'Unlikely', 'Possible', 'Likely', 'Frequent'];
  const sevLabels = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

  const lines: string[] = [];
  lines.push(`| P \\ S | ${sevLabels.join(' | ')} |`);
  lines.push(`|-------|${sevLabels.map(() => '---').join('|')}|`);

  for (let p = grid.length - 1; p >= 0; p--) {
    const row = grid[p].map((count) => (count > 0 ? String(count) : '-'));
    lines.push(`| ${probLabels[p]} | ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}
