export type RepoType = 'qms' | 'device';
export type RunMode = 'pr' | 'release';

export interface Config {
  type: RepoType;
  docsPath: string;
  frontmatter: {
    required: string[];
    recommended: string[];
  };
  traceability: {
    chains: TraceabilityChain[];
  };
  risk: {
    severityLevels: number;
    probabilityLevels: number;
  };
  pdf: {
    logo?: string;
    renderMermaid: boolean;
  };
}

export interface TraceabilityChain {
  source: string;
  target: string;
  link: string;
}

export interface Document {
  /** File path relative to repo root */
  filePath: string;
  /** Frontmatter document ID (e.g., SOP-001, UN-001) */
  id: string;
  title: string;
  status: string;
  /** Document type inferred from directory or frontmatter */
  docType: string;
  /** Raw frontmatter key-value pairs */
  frontmatter: Record<string, unknown>;
  /** Markdown body (without frontmatter) */
  body: string;
}

export interface DocumentIndex {
  /** All documents keyed by their frontmatter ID */
  byId: Map<string, Document>;
  /** All documents keyed by file path */
  byPath: Map<string, Document>;
  /** All documents grouped by type */
  byType: Map<string, Document[]>;
}

export type WarningSeverity = 'warning' | 'error';

export interface ValidationWarning {
  file: string;
  rule: string;
  message: string;
  severity: WarningSeverity;
}

export interface TraceabilityCoverage {
  chainName: string;
  sourceType: string;
  targetType: string;
  totalSources: number;
  coveredSources: number;
  coveragePercent: number;
}

export interface ChangelogEntry {
  commitSha: string;
  commitMessage: string;
  documentIds: string[];
}

export interface RiskEntry {
  id: string;
  title: string;
  severity: number;
  probability: number;
  residualSeverity?: number;
  residualProbability?: number;
  mitigates?: string[];
  acceptability: 'acceptable' | 'review_required' | 'unacceptable';
}

export interface RiskMatrix {
  inherent: number[][];
  residual: number[][];
  acceptability: ('acceptable' | 'review_required' | 'unacceptable')[][];
  risks: RiskEntry[];
  summary: {
    total: number;
    acceptable: number;
    reviewRequired: number;
    unacceptable: number;
  };
}

export interface GapEntry {
  documentId: string;
  gapType: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  warnings: ValidationWarning[];
  traceability: TraceabilityCoverage[];
  riskMatrix?: RiskMatrix;
  gaps: GapEntry[];
  changelog: ChangelogEntry[];
  changedDocuments: Document[];
  allDocuments: Document[];
}
