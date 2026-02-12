import type { Document, ValidationWarning } from '../types.js';

/**
 * Validate markdown structure: heading hierarchy and title consistency.
 */
export function validateMarkdown(documents: Document[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const doc of documents) {
    const lines = doc.body.split('\n');
    let lastHeadingLevel = 0;
    let foundH1 = false;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (!headingMatch) continue;

      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      if (level === 1) {
        foundH1 = true;
        // H1 should contain the document title
        if (!text.toLowerCase().includes(doc.title.toLowerCase().substring(0, 20))) {
          // Only warn if the title and H1 are very different
          const titleWords = doc.title.toLowerCase().split(/\s+/);
          const h1Words = text.toLowerCase().split(/\s+/);
          const overlap = titleWords.filter((w) => h1Words.includes(w)).length;
          if (overlap < Math.min(2, titleWords.length)) {
            warnings.push({
              file: doc.filePath,
              rule: 'markdown/heading-structure',
              message: `H1 "${text}" does not match frontmatter title "${doc.title}"`,
              severity: 'warning',
            });
          }
        }
      }

      // Check for skipped heading levels (e.g., H1 → H3 without H2)
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        warnings.push({
          file: doc.filePath,
          rule: 'markdown/heading-structure',
          message: `Skipped heading level: H${lastHeadingLevel} → H${level} (missing H${lastHeadingLevel + 1})`,
          severity: 'warning',
        });
      }

      lastHeadingLevel = level;
    }

    if (!foundH1 && doc.body.trim().length > 0) {
      warnings.push({
        file: doc.filePath,
        rule: 'markdown/heading-structure',
        message: 'Document has no H1 heading',
        severity: 'warning',
      });
    }
  }

  return warnings;
}
