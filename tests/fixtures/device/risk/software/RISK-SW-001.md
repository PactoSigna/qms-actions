---
id: RISK-SW-001
title: False Negative Detection Risk
status: approved
author: engineering@example.com
reviewers:
  - quality
approvers:
  - quality-lead
severity: 4
probability: 3
residual_severity: 4
residual_probability: 1
---

# Risk Analysis: False Negative Detection Risk

**Analyzes:** [HAZ-SW-001](HAZ-SW-001.md)
**Mitigates:** [SRS-001](../../software-requirements/SRS-001.md)

## Inherent Risk Assessment

| Factor | Rating | Justification |
|--------|--------|---------------|
| Severity | 4 (Critical) | Can cause missed diagnosis |
| Probability | 3 (Occasional) | Algorithm limitations |
| **Inherent Risk** | **12 - Unacceptable** | Requires mitigation |

## Residual Risk Assessment

| Factor | Rating | Justification |
|--------|--------|---------------|
| Residual Severity | 4 (Critical) | Severity unchanged |
| Residual Probability | 1 (Remote) | Controls effective |
| **Residual Risk** | **4 - Acceptable** | Mitigated |
