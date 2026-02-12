import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('returns QMS defaults when no config file exists', () => {
    const config = loadConfig('/nonexistent/.qmsrc.yml', 'qms');
    expect(config.type).toBe('qms');
    expect(config.docsPath).toBe('docs/');
    expect(config.frontmatter.required).toEqual(['id', 'title', 'status']);
    expect(config.traceability.chains.length).toBe(0); // QMS has no traceability chains
    expect(config.pdf.renderMermaid).toBe(true);
  });

  it('returns device defaults with traceability chains', () => {
    const config = loadConfig('/nonexistent/.qmsrc.yml', 'device');
    expect(config.type).toBe('device');
    expect(config.traceability.chains.length).toBe(5);
    expect(config.traceability.chains[0]).toEqual({
      source: 'product_requirement',
      target: 'user_need',
      link: 'derives_from',
    });
  });

  it('has default risk matrix settings', () => {
    const config = loadConfig('/nonexistent', 'device');
    expect(config.risk.severityLevels).toBe(5);
    expect(config.risk.probabilityLevels).toBe(5);
  });
});
