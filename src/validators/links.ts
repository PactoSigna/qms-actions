import type { Document, DocumentIndex, ValidationWarning } from '../types.js';
import { extractLinks } from '../parser.js';

/**
 * Validate that all internal document references resolve to existing documents.
 */
export function validateLinks(
  documents: Document[],
  index: DocumentIndex
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const doc of documents) {
    const links = extractLinks(doc);

    for (const link of links) {
      if (!index.byId.has(link.targetId)) {
        warnings.push({
          file: doc.filePath,
          rule: 'links/broken-reference',
          message: `Broken link: references "${link.targetId}" (${link.type}) but no document with that ID exists`,
          severity: 'warning',
        });
      }
    }
  }

  return warnings;
}
