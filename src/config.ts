import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { Config, RepoType, TraceabilityChain } from './types.js';

const DEFAULT_QMS_CHAINS: TraceabilityChain[] = [];

const DEFAULT_DEVICE_CHAINS: TraceabilityChain[] = [
  {
    source: 'product_requirement',
    target: 'user_need',
    link: 'derives_from',
  },
  {
    source: 'software_requirement',
    target: 'product_requirement',
    link: 'derives_from',
  },
  {
    source: 'test_case',
    target: 'software_requirement',
    link: 'verified_by',
  },
  {
    source: 'detailed_design',
    target: 'software_requirement',
    link: 'implements',
  },
  {
    source: 'risk',
    target: 'software_requirement',
    link: 'mitigates',
  },
];

function defaultConfig(type: RepoType): Config {
  return {
    type,
    docsPath: 'docs/',
    frontmatter: {
      required: ['id', 'title', 'status'],
      recommended: ['author', 'reviewers', 'approvers'],
    },
    traceability: {
      chains: type === 'device' ? DEFAULT_DEVICE_CHAINS : DEFAULT_QMS_CHAINS,
    },
    risk: {
      severityLevels: 5,
      probabilityLevels: 5,
    },
    pdf: {
      renderMermaid: true,
    },
  };
}

export function loadConfig(configPath: string, type: RepoType): Config {
  const defaults = defaultConfig(type);

  if (!existsSync(configPath)) {
    return defaults;
  }

  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw) as Record<string, unknown> | null;

  if (!parsed) {
    return defaults;
  }

  return {
    type: (parsed.type as RepoType) ?? defaults.type,
    docsPath: (parsed['docs-path'] as string) ?? defaults.docsPath,
    frontmatter: {
      required:
        (parsed.frontmatter as Record<string, unknown>)?.required as string[] ??
        defaults.frontmatter.required,
      recommended:
        (parsed.frontmatter as Record<string, unknown>)?.recommended as string[] ??
        defaults.frontmatter.recommended,
    },
    traceability: {
      chains:
        (parsed.traceability as Record<string, unknown>)?.chains as TraceabilityChain[] ??
        defaults.traceability.chains,
    },
    risk: {
      severityLevels:
        ((parsed.risk as Record<string, unknown>)?.['severity-levels'] as number) ??
        defaults.risk.severityLevels,
      probabilityLevels:
        ((parsed.risk as Record<string, unknown>)?.['probability-levels'] as number) ??
        defaults.risk.probabilityLevels,
    },
    pdf: {
      logo: (parsed.pdf as Record<string, unknown>)?.logo as string | undefined,
      renderMermaid:
        ((parsed.pdf as Record<string, unknown>)?.['render-mermaid'] as boolean) ??
        defaults.pdf.renderMermaid,
    },
  };
}
