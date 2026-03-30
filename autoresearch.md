# Autoresearch: Directory Suggestion Engine

## Objective
Optimize the quality of directory suggestions for the `/add-dir` command in pi-add-dir.
The suggestion engine should surface relevant directories from the project environment
using multiple heuristics (sibling projects, local deps, workspace members, submodules, etc.).

The benchmark evaluates the algorithm against 8 realistic project structure scenarios:
monorepo, sibling projects, git submodules, Rails Gemfile paths, Rust workspace,
Python monorepo, extension projects, and Go workspace.

## Metrics
- **Primary**: `suggestion_f1` (unitless 0–1, higher is better) — F1 score across all scenarios
- **Secondary**: `precision`, `recall`, `latency_ms` — tradeoff monitors

## How to Run
`./autoresearch.sh` — runs typecheck + benchmark, outputs `METRIC name=value` lines.

## Files in Scope
- `extensions/pi-add-dir/suggestions.ts` — the suggestion engine (all heuristics + scoring)
- `tests/suggestions.bench.ts` — benchmark with 8 scenarios and expected results
- `tests/fixtures/setup-fixtures.sh` — creates test project structures

## Off Limits
- `extensions/pi-add-dir/index.ts` — main extension (don't modify during optimization)
- `tests/helpers.test.ts` — existing unit tests must stay passing
- Test fixture structure and expected results — don't cheat by changing the benchmark

## Constraints
- `npx tsc --noEmit` must pass (type safety)
- `npx vitest run` must pass (existing tests)
- No new npm dependencies
- Suggestions must come from genuine project signals, not hardcoded paths
- Keep latency under 50ms per scenario average

## What's Been Tried
- **Baseline**: Initial implementation with 7 heuristic collectors + scoring with context bonuses.
