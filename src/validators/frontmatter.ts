import type { Config, Document, DocumentIndex, ValidationWarning } from '../types.js';

/**
 * Validate frontmatter fields across all documents.
 * Checks required fields, recommended fields, and duplicate IDs.
 */
export function validateFrontmatter(
  documents: Document[],
  index: DocumentIndex,
  config: Config
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check for duplicate IDs
  const idCounts = new Map<string, string[]>();
  for (const doc of documents) {
    const existing = idCounts.get(doc.id) ?? [];
    existing.push(doc.filePath);
    idCounts.set(doc.id, existing);
  }

  for (const [id, files] of idCounts) {
    if (files.length > 1) {
      for (const file of files) {
        warnings.push({
          file,
          rule: 'frontmatter/duplicate-id',
          message: `Duplicate document ID "${id}" also found in: ${files.filter((f) => f !== file).join(', ')}`,
          severity: 'warning',
        });
      }
    }
  }

  // Check required and recommended fields per document
  for (const doc of documents) {
    for (const field of config.frontmatter.required) {
      if (!(field in doc.frontmatter) || doc.frontmatter[field] === undefined) {
        warnings.push({
          file: doc.filePath,
          rule: 'frontmatter/required-fields',
          message: `Missing required frontmatter field: "${field}"`,
          severity: 'warning',
        });
      }
    }

    for (const field of config.frontmatter.recommended) {
      if (!(field in doc.frontmatter) || doc.frontmatter[field] === undefined) {
        warnings.push({
          file: doc.filePath,
          rule: 'frontmatter/optional-fields',
          message: `Missing recommended frontmatter field: "${field}"`,
          severity: 'warning',
        });
      }
    }
  }

  return warnings;
}
