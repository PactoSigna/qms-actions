# PactoSigna QMS Actions

GitHub Action for validating QMS and medical device documentation, checking traceability, and building PDF exports.

## Features

### PR Validation (`mode: pr`)

- **Frontmatter checks** — required fields (`id`, `title`, `status`), recommended fields, duplicate ID detection
- **Link validation** — broken internal document references
- **Markdown structure** — heading hierarchy, title consistency
- **Traceability analysis** (device repos) — requirement derivation, test coverage, risk mitigation chains
- **Risk matrix** (device repos) — ISO 14971 inherent/residual risk grid
- **PR comment** — summary of warnings, traceability coverage, and changelog (updates in-place)

### Release Export (`mode: release`)

- **Incremental PDF builds** — only changed documents since last release
- **Mermaid diagrams** — rendered as actual SVG in PDFs
- **PTA/PRA report** (device repos) — traceability matrix, risk matrix, gap analysis
- **Changelog** — commits mapped to affected documents
- **Release assets** — PDFs and reports attached to the GitHub release

## Quick Start

```yaml
name: QMS Validation

on:
  pull_request:
    paths: ['docs/**']
  release:
    types: [published]

permissions:
  contents: write
  pull-requests: write

jobs:
  validate:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: PactoSigna/qms-actions@v1
        with:
          type: device  # or 'qms'
          mode: pr
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  export:
    if: github.event_name == 'release'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: PactoSigna/qms-actions@v1
        with:
          type: device  # or 'qms'
          mode: release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `type` | yes | — | `qms` or `device` |
| `docs-path` | no | `docs/` | Path to documents directory |
| `mode` | no | `pr` | `pr` (validate + comment) or `release` (build PDFs + attach) |
| `pactosigna-api-key` | no | — | Enables Part 11 features (signatures, audit trails) |
| `config-file` | no | `.qmsrc.yml` | Custom config path |

## Repository Types

### QMS (`type: qms`)

For repositories containing SOPs, policies, and work instructions. Validates frontmatter, links, and markdown structure.

Example: [Sample.QMS.ISO13485](https://github.com/PactoSigna/Sample.QMS.ISO13485)

### Device (`type: device`)

For repositories containing user needs, requirements, architecture, risks, and test cases. Includes all QMS checks plus traceability chain validation and risk matrix generation.

Example: [Sample.Device.SaMD-C](https://github.com/PactoSigna/Sample.Device.SaMD-C)

## Configuration

Drop a `.qmsrc.yml` in your repo root to customize. All settings are optional — defaults work out of the box.

```yaml
type: device
docs-path: docs/

frontmatter:
  required: [id, title, status]
  recommended: [author, reviewers, approvers]

traceability:
  chains:
    - source: product_requirement
      target: user_need
      link: derives_from
    - source: software_requirement
      target: product_requirement
      link: derives_from
    - source: test_case
      target: software_requirement
      link: verified_by
    - source: detailed_design
      target: software_requirement
      link: implements
    - source: risk
      target: software_requirement
      link: mitigates

risk:
  severity-levels: 5
  probability-levels: 5

pdf:
  logo: assets/logo.png
  render-mermaid: true
```

## Validation Rules

### All Repos

| Rule | Description |
|------|-------------|
| `frontmatter/required-fields` | `id`, `title`, `status` present |
| `frontmatter/optional-fields` | `author`, `reviewers`, `approvers` present |
| `frontmatter/duplicate-id` | No two files share the same `id` |
| `links/broken-reference` | Internal links resolve to existing document IDs |
| `markdown/heading-structure` | No skipped heading levels, H1 matches title |

### Device Repos (additional)

| Rule | Description |
|------|-------------|
| `traceability/requirement-derivation` | Requirements link to user needs via `derives_from` |
| `traceability/test-coverage` | Requirements have `verified_by` test cases |
| `traceability/risk-mitigation` | Risks link to requirements via `mitigates` |
| `traceability/hazard-chain` | Hazard → situation → harm chain is complete |
| `traceability/coverage-delta` | Reports traceability coverage changes |

All rules report as **warnings** (advisory, never blocks merge).

## Part 11 Compliance

Connect [PactoSigna](https://pactosigna.com) for 21 CFR Part 11 features:

- Electronic signature blocks in PDFs
- Training compliance status
- Audit trail inclusion
- Configurable severity levels (block merge on policy violations)

```yaml
- uses: PactoSigna/qms-actions@v1
  with:
    type: device
    mode: release
    pactosigna-api-key: ${{ secrets.PACTOSIGNA_API_KEY }}
```

## License

MIT
