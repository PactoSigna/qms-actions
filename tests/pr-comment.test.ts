import { describe, it, expect } from 'vitest';
import { renderPrComment, buildCommentBody, COMMENT_MARKER } from '../src/reports/pr-comment.js';
import type { PrCommentData } from '../src/reports/pr-comment.js';

describe('renderPrComment', () => {
  const baseData: PrCommentData = {
    repoType: 'device',
    changedDocuments: [
      {
        filePath: 'docs/software-requirements/SRS-005.md',
        id: 'SRS-005',
        title: 'New Data Export Requirement',
        status: 'draft',
        docType: 'software_requirement',
        frontmatter: { id: 'SRS-005', title: 'New Data Export Requirement', status: 'draft' },
        body: '',
      },
    ],
    warnings: [
      {
        file: 'docs/software-requirements/SRS-005.md',
        rule: 'traceability/test-coverage',
        message: 'No verified_by test case found',
        severity: 'warning',
      },
    ],
    traceability: [
      {
        chainName: 'User Need → Requirement',
        sourceType: 'user_need',
        targetType: 'product_requirement',
        totalSources: 2,
        coveredSources: 2,
        coveragePercent: 100,
      },
      {
        chainName: 'Requirement → Test Case',
        sourceType: 'software_requirement',
        targetType: 'test_case',
        totalSources: 6,
        coveredSources: 5,
        coveragePercent: 83,
      },
    ],
    changelog: [
      {
        commitSha: 'a1b2c3d4e5f6g7h8',
        commitMessage: 'feat: add data export',
        documentIds: ['SRS-005'],
      },
    ],
  };

  it('renders header with summary', () => {
    const md = renderPrComment(baseData);
    expect(md).toContain('## QMS Validation Report');
    expect(md).toContain('**Type:** Device');
    expect(md).toContain('**Docs changed:** 1');
    expect(md).toContain('**Total warnings:** 1');
  });

  it('renders changed documents table', () => {
    const md = renderPrComment(baseData);
    expect(md).toContain('SRS-005');
    expect(md).toContain('New Data Export Requirement');
    expect(md).toContain('1 warning');
  });

  it('renders warnings table', () => {
    const md = renderPrComment(baseData);
    expect(md).toContain('`traceability/test-coverage`');
    expect(md).toContain('No verified_by test case found');
  });

  it('renders traceability summary', () => {
    const md = renderPrComment(baseData);
    expect(md).toContain('User Need → Requirement');
    expect(md).toContain('100%');
    expect(md).toContain('83%');
  });

  it('renders changelog', () => {
    const md = renderPrComment(baseData);
    expect(md).toContain('`a1b2c3d`');
    expect(md).toContain('SRS-005');
  });

  it('includes PactoSigna CTA footer', () => {
    const md = renderPrComment(baseData);
    expect(md).toContain('PactoSigna QMS Actions');
    expect(md).toContain('pactosigna.com');
  });
});

describe('buildCommentBody', () => {
  it('includes hidden marker for update-in-place', () => {
    const body = buildCommentBody({
      repoType: 'qms',
      changedDocuments: [],
      warnings: [],
      traceability: [],
      changelog: [],
    });
    expect(body).toContain(COMMENT_MARKER);
  });
});
