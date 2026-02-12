import * as core from '@actions/core';
import * as github from '@actions/github';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig } from './config.js';
import { buildDocumentIndex } from './parser.js';
import { validateFrontmatter } from './validators/frontmatter.js';
import { validateLinks } from './validators/links.js';
import { validateMarkdown } from './validators/markdown.js';
import { validateTraceability } from './validators/traceability.js';
import { buildChangelog, getChangedFiles, getPreviousTag } from './reports/changelog.js';
import { buildCommentBody, COMMENT_MARKER } from './reports/pr-comment.js';
import { buildRiskMatrix } from './reports/risk-matrix.js';
import {
  renderTraceabilityReportHtml,
  renderTraceabilityReportMarkdown,
} from './reports/traceability-matrix.js';
import { renderDocumentPdf, renderHtmlToPdf } from './reports/pdf-renderer.js';
import type { ChangelogEntry, Document, RepoType, RunMode } from './types.js';

async function run(): Promise<void> {
  try {
    const repoType = (core.getInput('type') || process.env.INPUT_TYPE) as RepoType;
    const docsPath = core.getInput('docs-path') || process.env.INPUT_DOCS_PATH || 'docs/';
    const mode = (core.getInput('mode') || process.env.INPUT_MODE || 'pr') as RunMode;
    const configFile =
      core.getInput('config-file') || process.env.INPUT_CONFIG_FILE || '.qmsrc.yml';

    if (!repoType || !['qms', 'device'].includes(repoType)) {
      core.setFailed('Input "type" is required and must be "qms" or "device"');
      return;
    }

    const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
    const config = loadConfig(join(repoRoot, configFile), repoType);

    core.info(`QMS Actions: type=${repoType}, mode=${mode}, docs=${docsPath}`);

    // Build full document index
    const index = buildDocumentIndex(docsPath, repoRoot);
    core.info(`Found ${index.byId.size} documents`);

    // Run validators on all documents
    const allDocs = Array.from(index.byId.values());
    const frontmatterWarnings = validateFrontmatter(allDocs, index, config);
    const linkWarnings = validateLinks(allDocs, index);
    const markdownWarnings = validateMarkdown(allDocs);
    const { warnings: traceabilityWarnings, coverage, gaps } = validateTraceability(
      allDocs,
      index,
      config
    );

    const allWarnings = [
      ...frontmatterWarnings,
      ...linkWarnings,
      ...markdownWarnings,
      ...traceabilityWarnings,
    ];

    // Build risk matrix (device only)
    const riskMatrix = repoType === 'device' ? buildRiskMatrix(index) : null;

    if (mode === 'pr') {
      await runPrMode(repoRoot, docsPath, repoType, index, allDocs, allWarnings, coverage, riskMatrix);
    } else if (mode === 'release') {
      await runReleaseMode(repoRoot, docsPath, repoType, config, index, allDocs, allWarnings, coverage, gaps, riskMatrix);
    }

    // Set outputs
    core.setOutput('warnings-count', allWarnings.length);
    core.setOutput('documents-count', index.byId.size);
    if (coverage.length > 0) {
      const avgCoverage = Math.round(
        coverage.reduce((sum, c) => sum + c.coveragePercent, 0) / coverage.length
      );
      core.setOutput('traceability-coverage', avgCoverage);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

async function runPrMode(
  repoRoot: string,
  docsPath: string,
  repoType: string,
  index: ReturnType<typeof buildDocumentIndex>,
  allDocs: Document[],
  allWarnings: ReturnType<typeof validateFrontmatter>,
  coverage: ReturnType<typeof validateTraceability>['coverage'],
  riskMatrix: ReturnType<typeof buildRiskMatrix>
): Promise<void> {
  const context = github.context;
  const pr = context.payload.pull_request;

  if (!pr) {
    core.warning('Not running in a pull request context. Skipping PR comment.');
    // Still log warnings to console
    for (const w of allWarnings) {
      core.warning(`[${w.rule}] ${w.file}: ${w.message}`);
    }
    return;
  }

  // Get changed files in this PR
  const baseRef = pr.base.sha as string;
  const headRef = pr.head.sha as string;
  const changedFiles = getChangedFiles(baseRef, headRef, docsPath, repoRoot);
  const changedDocs = changedFiles
    .map((f) => index.byPath.get(f))
    .filter((d): d is Document => d !== undefined);

  // Filter warnings to changed files only (for the changed docs table)
  // But show all traceability warnings since they affect the whole graph

  // Build changelog
  const changelog = buildChangelog(index, baseRef, headRef, repoRoot);

  // Generate comment body
  const commentBody = buildCommentBody({
    repoType,
    changedDocuments: changedDocs,
    warnings: allWarnings.filter((w) =>
      changedFiles.includes(w.file) ||
      w.rule.startsWith('traceability/') ||
      w.rule === 'frontmatter/duplicate-id'
    ),
    traceability: coverage,
    changelog,
    riskMatrix,
  });

  // Post or update PR comment
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning('No GITHUB_TOKEN available. Logging results to console instead.');
    core.info(commentBody);
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = context.repo;
  const prNumber = pr.number as number;

  // Find existing comment
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });

  const existingComment = comments.find((c) =>
    c.body?.includes(COMMENT_MARKER)
  );

  if (existingComment) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body: commentBody,
    });
    core.info(`Updated existing PR comment #${existingComment.id}`);
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody,
    });
    core.info('Created new PR comment');
  }
}

async function runReleaseMode(
  repoRoot: string,
  docsPath: string,
  repoType: string,
  config: ReturnType<typeof loadConfig>,
  index: ReturnType<typeof buildDocumentIndex>,
  allDocs: Document[],
  allWarnings: ReturnType<typeof validateFrontmatter>,
  coverage: ReturnType<typeof validateTraceability>['coverage'],
  gaps: ReturnType<typeof validateTraceability>['gaps'],
  riskMatrix: ReturnType<typeof buildRiskMatrix>
): Promise<void> {
  const context = github.context;
  const release = context.payload.release;
  const releaseTag = release?.tag_name as string | undefined;

  // Determine which docs changed since last release
  const prevTag = getPreviousTag(repoRoot);
  const currentRef = releaseTag ?? 'HEAD';
  let changedFiles: string[];

  if (prevTag) {
    changedFiles = getChangedFiles(prevTag, currentRef, docsPath, repoRoot);
    core.info(`Incremental build: ${changedFiles.length} docs changed since ${prevTag}`);
  } else {
    // First release — build everything
    changedFiles = allDocs.map((d) => d.filePath);
    core.info(`First release: building all ${changedFiles.length} docs`);
  }

  const changedDocs = changedFiles
    .map((f) => index.byPath.get(f))
    .filter((d): d is Document => d !== undefined);

  // Get current commit SHA
  const commitSha = execSync('git rev-parse HEAD', {
    cwd: repoRoot,
    encoding: 'utf-8',
  }).trim();

  // Build changelog
  const changelog = prevTag
    ? buildChangelog(index, prevTag, currentRef, repoRoot)
    : [];

  // Create output directory
  const outputDir = join(repoRoot, '.qms-output');
  const docsOutputDir = join(outputDir, 'documents');
  mkdirSync(docsOutputDir, { recursive: true });

  // Build PDFs for changed docs
  core.info(`Building PDFs for ${changedDocs.length} documents...`);
  for (const doc of changedDocs) {
    try {
      const pdf = await renderDocumentPdf(doc, commitSha, config.pdf.renderMermaid);
      const pdfPath = join(docsOutputDir, `${doc.id}.pdf`);
      writeFileSync(pdfPath, pdf);
      core.info(`  Built: ${doc.id}.pdf`);
    } catch (error) {
      core.warning(`Failed to build PDF for ${doc.id}: ${error}`);
    }
  }

  // Generate traceability report (device repos)
  if (repoType === 'device') {
    core.info('Generating traceability report...');

    // Markdown version
    const reportMd = renderTraceabilityReportMarkdown(
      index,
      coverage,
      gaps,
      riskMatrix,
      changelog,
      releaseTag
    );
    writeFileSync(join(outputDir, 'TRACEABILITY-REPORT.md'), reportMd);

    // PDF version
    const reportHtml = renderTraceabilityReportHtml(
      index,
      coverage,
      gaps,
      riskMatrix,
      changelog,
      releaseTag
    );
    const reportPdf = await renderHtmlToPdf(reportHtml);
    writeFileSync(join(outputDir, 'TRACEABILITY-REPORT.pdf'), reportPdf);

    core.info('  Built: TRACEABILITY-REPORT.pdf');
  }

  // Generate changelog
  if (changelog.length > 0) {
    const changelogMd = generateChangelogMarkdown(changelog, releaseTag);
    writeFileSync(join(outputDir, 'CHANGELOG.md'), changelogMd);
    core.info('  Built: CHANGELOG.md');
  }

  // Upload release assets if in release context
  const token = process.env.GITHUB_TOKEN;
  if (release && token) {
    await uploadReleaseAssets(outputDir, changedDocs, repoType, token);
  } else {
    core.info(`Output written to ${outputDir}`);
  }

  core.setOutput('output-dir', outputDir);
}

async function uploadReleaseAssets(
  outputDir: string,
  changedDocs: Document[],
  repoType: string,
  token: string
): Promise<void> {
  const context = github.context;
  const octokit = github.getOctokit(token);
  const { owner, repo } = context.repo;
  const releaseId = context.payload.release.id as number;

  const { readFileSync, readdirSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');

  // Upload individual document PDFs
  const docsDir = pathJoin(outputDir, 'documents');
  const pdfFiles = readdirSync(docsDir).filter((f) => f.endsWith('.pdf'));

  for (const pdfFile of pdfFiles) {
    const filePath = pathJoin(docsDir, pdfFile);
    const content = readFileSync(filePath);

    await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      name: pdfFile,
      data: content as unknown as string,
      headers: { 'content-type': 'application/pdf' },
    });
    core.info(`  Uploaded: ${pdfFile}`);
  }

  // Upload traceability report
  if (repoType === 'device') {
    const reportPath = pathJoin(outputDir, 'TRACEABILITY-REPORT.pdf');
    try {
      const content = readFileSync(reportPath);
      await octokit.rest.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: releaseId,
        name: 'TRACEABILITY-REPORT.pdf',
        data: content as unknown as string,
        headers: { 'content-type': 'application/pdf' },
      });
      core.info('  Uploaded: TRACEABILITY-REPORT.pdf');
    } catch {
      // Report may not exist for QMS repos
    }
  }

  // Upload changelog
  const changelogPath = pathJoin(outputDir, 'CHANGELOG.md');
  try {
    const content = readFileSync(changelogPath);
    await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      name: 'CHANGELOG.md',
      data: content as unknown as string,
      headers: { 'content-type': 'text/markdown' },
    });
    core.info('  Uploaded: CHANGELOG.md');
  } catch {
    // Changelog may not exist
  }
}

function generateChangelogMarkdown(
  changelog: ChangelogEntry[],
  releaseTag?: string
): string {
  const lines: string[] = [];
  lines.push(`# Changelog${releaseTag ? ` — ${releaseTag}` : ''}`);
  lines.push('');
  lines.push('| Commit | Message | Documents |');
  lines.push('|--------|---------|-----------|');
  for (const entry of changelog) {
    lines.push(
      `| ${entry.commitSha.substring(0, 7)} | ${entry.commitMessage} | ${entry.documentIds.join(', ')} |`
    );
  }
  lines.push('');
  lines.push('---');
  lines.push('*Generated by [PactoSigna QMS Actions](https://github.com/PactoSigna/qms-actions)*');
  return lines.join('\n');
}

run();
