import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import matter from 'gray-matter';
import type { Document, DocumentIndex } from './types.js';

/** Map directory names to document types */
const DIR_TYPE_MAP: Record<string, string> = {
  'user-needs': 'user_need',
  'product-requirements': 'product_requirement',
  'software-requirements': 'software_requirement',
  architecture: 'architecture',
  design: 'detailed_design',
  test: 'test_case',
  risk: 'risk',
  sops: 'sop',
  policies: 'policy',
  'work-instructions': 'work_instruction',
  'external-reports': 'external_report',
  harms: 'harm',
  situations: 'hazardous_situation',
  software: 'risk',
  usability: 'risk',
  security: 'risk',
};

function inferDocType(filePath: string): string {
  const parts = filePath.split('/');
  // Walk from deepest directory up to find a matching type
  for (let i = parts.length - 2; i >= 0; i--) {
    const dir = parts[i];
    if (DIR_TYPE_MAP[dir]) {
      return DIR_TYPE_MAP[dir];
    }
  }

  // Fallback: infer from ID prefix
  return 'unknown';
}

function inferTypeFromId(id: string): string {
  const prefix = id.split('-')[0]?.toUpperCase();
  const prefixMap: Record<string, string> = {
    UN: 'user_need',
    PRS: 'product_requirement',
    SRS: 'software_requirement',
    SDD: 'detailed_design',
    HLD: 'architecture',
    TC: 'test_case',
    RISK: 'risk',
    HAZ: 'hazard',
    HS: 'hazardous_situation',
    HARM: 'harm',
    SOP: 'sop',
    POL: 'policy',
    WI: 'work_instruction',
    AUD: 'external_report',
    PT: 'external_report',
  };
  return prefixMap[prefix] ?? 'unknown';
}

export function parseDocument(filePath: string, repoRoot: string): Document | null {
  const fullPath = join(repoRoot, filePath);
  const content = readFileSync(fullPath, 'utf-8');
  const { data, content: body } = matter(content);

  const id = (data.id as string) ?? '';
  if (!id) return null;

  let docType = inferDocType(filePath);
  if (docType === 'unknown') {
    docType = inferTypeFromId(id);
  }

  return {
    filePath,
    id,
    title: (data.title as string) ?? 'Untitled',
    status: (data.status as string) ?? 'unknown',
    docType,
    frontmatter: data,
    body,
  };
}

function collectMarkdownFiles(dirPath: string, basePath: string): string[] {
  const files: string[] = [];

  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath, basePath));
    } else if (extname(entry) === '.md') {
      files.push(relative(basePath, fullPath));
    }
  }

  return files;
}

export function buildDocumentIndex(docsPath: string, repoRoot: string): DocumentIndex {
  const fullDocsPath = join(repoRoot, docsPath);
  const markdownFiles = collectMarkdownFiles(fullDocsPath, repoRoot);

  const byId = new Map<string, Document>();
  const byPath = new Map<string, Document>();
  const byType = new Map<string, Document[]>();

  for (const filePath of markdownFiles) {
    const doc = parseDocument(filePath, repoRoot);
    if (!doc) continue;

    byId.set(doc.id, doc);
    byPath.set(doc.filePath, doc);

    const typeList = byType.get(doc.docType) ?? [];
    typeList.push(doc);
    byType.set(doc.docType, typeList);
  }

  return { byId, byPath, byType };
}

/**
 * Extract link references from document body and frontmatter.
 * Looks for markdown links like [PRS-001](../product-requirements/PRS-001.md)
 * and frontmatter fields like derives_from, mitigates, verified_by, etc.
 */
export function extractLinks(doc: Document): { type: string; targetId: string }[] {
  const links: { type: string; targetId: string }[] = [];

  // Extract from markdown body: **Derives from:** [PRS-001](...)
  const linkPatterns = [
    { pattern: /\*\*Derives from:\*\*\s*\[([^\]]+)\]/gi, type: 'derives_from' },
    { pattern: /\*\*Verifies:\*\*\s*(.+)/gi, type: 'verified_by' },
    { pattern: /\*\*Validates:\*\*\s*(.+)/gi, type: 'validated_by' },
    { pattern: /\*\*Implements:\*\*\s*\[([^\]]+)\]/gi, type: 'implements' },
    { pattern: /\*\*Mitigates:\*\*\s*\[([^\]]+)\]/gi, type: 'mitigates' },
    { pattern: /\*\*Analyzes:\*\*\s*\[([^\]]+)\]/gi, type: 'analyzes' },
    { pattern: /\*\*Leads to:\*\*\s*\[([^\]]+)\]/gi, type: 'leads_to' },
    { pattern: /\*\*Results in:\*\*\s*\[([^\]]+)\]/gi, type: 'results_in' },
  ];

  for (const { pattern, type } of linkPatterns) {
    let match;
    while ((match = pattern.exec(doc.body)) !== null) {
      const text = match[1];
      // Could be multiple links: [SRS-001](url), [SRS-002](url)
      const idMatches = text.match(/\[([^\]]+)\]/g);
      if (idMatches) {
        for (const idMatch of idMatches) {
          const id = idMatch.replace(/[[\]]/g, '');
          links.push({ type, targetId: id });
        }
      } else {
        // Single ID without brackets
        const id = text.trim();
        if (id) links.push({ type, targetId: id });
      }
    }
  }

  return links;
}
