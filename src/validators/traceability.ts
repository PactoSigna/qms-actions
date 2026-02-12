import type {
  Config,
  Document,
  DocumentIndex,
  GapEntry,
  TraceabilityCoverage,
  ValidationWarning,
} from '../types.js';
import { extractLinks } from '../parser.js';

/**
 * Validate traceability chains for device repos.
 * Checks that documents have the required links defined in config chains.
 * Returns warnings for missing links and coverage stats.
 */
export function validateTraceability(
  documents: Document[],
  index: DocumentIndex,
  config: Config
): { warnings: ValidationWarning[]; coverage: TraceabilityCoverage[]; gaps: GapEntry[] } {
  const warnings: ValidationWarning[] = [];
  const coverage: TraceabilityCoverage[] = [];
  const gaps: GapEntry[] = [];

  if (config.type !== 'device') {
    return { warnings, coverage, gaps };
  }

  // Build a lookup of all links per document
  const docLinks = new Map<string, { type: string; targetId: string }[]>();
  for (const doc of documents) {
    docLinks.set(doc.id, extractLinks(doc));
  }

  // Check each traceability chain
  for (const chain of config.traceability.chains) {
    const sourceDocs = index.byType.get(chain.source) ?? [];
    let coveredCount = 0;

    for (const sourceDoc of sourceDocs) {
      const links = docLinks.get(sourceDoc.id) ?? [];
      const hasRequiredLink = links.some((l) => {
        // For verified_by chain, the test case links TO the requirement
        // So we need to check reverse: does any target-type doc link to this source?
        if (chain.link === 'verified_by') {
          return l.type === 'verified_by' || l.type === 'validated_by';
        }
        return l.type === chain.link;
      });

      if (hasRequiredLink) {
        coveredCount++;
      } else {
        // For verified_by, check reverse direction
        if (chain.link === 'verified_by') {
          const targetDocs = index.byType.get(chain.target) ?? [];
          const hasCoveringTarget = targetDocs.some((targetDoc) => {
            const targetLinks = docLinks.get(targetDoc.id) ?? [];
            return targetLinks.some(
              (l) =>
                (l.type === 'verified_by' || l.type === 'validated_by') &&
                l.targetId === sourceDoc.id
            );
          });
          if (hasCoveringTarget) {
            coveredCount++;
            continue;
          }
        }

        const ruleMap: Record<string, string> = {
          derives_from: 'traceability/requirement-derivation',
          verified_by: 'traceability/test-coverage',
          mitigates: 'traceability/risk-mitigation',
          implements: 'traceability/design-coverage',
        };

        warnings.push({
          file: sourceDoc.filePath,
          rule: ruleMap[chain.link] ?? 'traceability/missing-link',
          message: `${sourceDoc.id} (${chain.source}) has no "${chain.link}" link to a ${chain.target}`,
          severity: 'warning',
        });

        gaps.push({
          documentId: sourceDoc.id,
          gapType: `missing_${chain.link}`,
          message: `No "${chain.link}" link to ${chain.target}`,
          severity: 'warning',
        });
      }
    }

    const chainName = `${formatTypeName(chain.source)} → ${formatTypeName(chain.target)}`;
    coverage.push({
      chainName,
      sourceType: chain.source,
      targetType: chain.target,
      totalSources: sourceDocs.length,
      coveredSources: coveredCount,
      coveragePercent: sourceDocs.length > 0 ? Math.round((coveredCount / sourceDocs.length) * 100) : 100,
    });
  }

  // Check hazard chains (hazard → situation → harm)
  validateHazardChains(documents, index, docLinks, warnings, gaps);

  return { warnings, coverage, gaps };
}

function validateHazardChains(
  documents: Document[],
  index: DocumentIndex,
  docLinks: Map<string, { type: string; targetId: string }[]>,
  warnings: ValidationWarning[],
  gaps: GapEntry[]
): void {
  // Check risks that analyze hazards
  const risks = index.byType.get('risk') ?? [];
  for (const risk of risks) {
    const links = docLinks.get(risk.id) ?? [];
    const analyzesLink = links.find((l) => l.type === 'analyzes');
    if (!analyzesLink) continue;

    const hazardId = analyzesLink.targetId;
    const hazardDoc = index.byId.get(hazardId);
    if (!hazardDoc) continue;

    const hazardLinks = docLinks.get(hazardId) ?? [];
    const leadsTo = hazardLinks.find((l) => l.type === 'leads_to');
    if (!leadsTo) {
      warnings.push({
        file: hazardDoc.filePath,
        rule: 'traceability/hazard-chain',
        message: `Hazard ${hazardId} has no "leads_to" hazardous situation`,
        severity: 'warning',
      });
      gaps.push({
        documentId: hazardId,
        gapType: 'hazard_no_situation',
        message: 'Hazard has no leads_to link',
        severity: 'warning',
      });
    } else {
      const situationDoc = index.byId.get(leadsTo.targetId);
      if (situationDoc) {
        const situationLinks = docLinks.get(leadsTo.targetId) ?? [];
        const resultsIn = situationLinks.find((l) => l.type === 'results_in');
        if (!resultsIn) {
          warnings.push({
            file: situationDoc.filePath,
            rule: 'traceability/hazard-chain',
            message: `Hazardous situation ${leadsTo.targetId} has no "results_in" harm`,
            severity: 'warning',
          });
          gaps.push({
            documentId: leadsTo.targetId,
            gapType: 'situation_no_harm',
            message: 'Situation has no results_in link',
            severity: 'warning',
          });
        }
      }
    }
  }
}

function formatTypeName(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
