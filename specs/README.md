# Specs

Each major update to the codebase gets its own spec: what needs to be done, what was done, and what is still open. Specs describe scope and outcome only, not implementation details.

## Index

| # | Spec | Status |
| --- | --- | --- |
| 001 | [Initial dashboard](001-initial-dashboard.md) | Done |

## Conventions

- **File name:** `NNN-short-kebab-name.md`, numbered in sequence (`002-transfer-planner.md`, …).
- **New spec:** copy [`_template.md`](_template.md), fill in the requirements, and add a row to the index above.
- **While working:** tick items off under *Done* as they ship. Put anything deferred under *Known limitations* or *Possible next steps*.
- **Finished:** set the status to *Done* here and in the spec. Leave finished specs as a record. If a later spec changes earlier behaviour, say so in the new spec instead of editing the old one.
- **Status values:** Draft → In progress → Done (or Abandoned).
