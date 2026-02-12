import { execSync } from 'node:child_process';
import type { ChangelogEntry, DocumentIndex } from '../types.js';

/**
 * Build changelog mapping commits to affected documents.
 * Uses git diff to find changed files, then maps them to document IDs via frontmatter.
 */
export function buildChangelog(
  index: DocumentIndex,
  baseRef: string,
  headRef: string,
  repoRoot: string
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];

  // Get commits between base and head
  const logOutput = execSync(
    `git log --format="%H|%s" ${baseRef}..${headRef} -- "*.md"`,
    { cwd: repoRoot, encoding: 'utf-8' }
  ).trim();

  if (!logOutput) return entries;

  const commits = logOutput.split('\n').filter(Boolean);

  for (const commit of commits) {
    const [sha, ...messageParts] = commit.split('|');
    const message = messageParts.join('|');

    // Get files changed in this commit
    const filesOutput = execSync(
      `git diff-tree --no-commit-id --name-only -r ${sha} -- "*.md"`,
      { cwd: repoRoot, encoding: 'utf-8' }
    ).trim();

    if (!filesOutput) continue;

    const changedFiles = filesOutput.split('\n').filter(Boolean);
    const documentIds: string[] = [];

    for (const file of changedFiles) {
      const doc = index.byPath.get(file);
      if (doc) {
        documentIds.push(doc.id);
      }
    }

    if (documentIds.length > 0) {
      entries.push({
        commitSha: sha,
        commitMessage: message,
        documentIds,
      });
    }
  }

  return entries;
}

/**
 * Get the list of changed document file paths between two refs.
 */
export function getChangedFiles(
  baseRef: string,
  headRef: string,
  docsPath: string,
  repoRoot: string
): string[] {
  try {
    const output = execSync(
      `git diff --name-only ${baseRef}...${headRef} -- "${docsPath}"`,
      { cwd: repoRoot, encoding: 'utf-8' }
    ).trim();

    if (!output) return [];
    return output.split('\n').filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

/**
 * Find the previous release tag for incremental builds.
 */
export function getPreviousTag(repoRoot: string): string | null {
  try {
    const tag = execSync('git describe --tags --abbrev=0 HEAD^', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
    return tag || null;
  } catch {
    return null;
  }
}
