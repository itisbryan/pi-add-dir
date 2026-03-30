# Autoresearch: Directory Suggestion Engine

## Objective
Optimize the quality of directory suggestions for the `/add-dir` command in pi-add-dir.
The suggestion engine should surface relevant directories from the project environment
using multiple heuristics (sibling projects, local deps, workspace members, submodules, etc.).

The benchmark evaluates the algorithm against 33 realistic project structure scenarios
across npm, pnpm, Yarn Berry, Cargo, Go, Python/uv, Ruby, Elixir, Gradle, Maven,
Docker Compose, TypeScript project refs, .NET, PHP, Swift, Flutter/Dart, and
adversarial edge cases (deep nesting, symlinks, nested workspaces, precision stress).

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
- **Baseline (F1=0.86)**: Initial 7 heuristic collectors. Perfect recall but precision issues — sibling collector was over-eager.
- **Smart sibling filtering (F1→1.0)**: Same-repo check via git root, context-file boost, >3 sibling threshold to prune unrelated projects.
- **Ancestor exclusion**: Filter dirs that are ancestors of cwd (prevents suggesting `packages/ui` when inside `packages/ui/src/components`).
- **Docker Compose heuristic**: Parse build context paths from docker-compose.yml/yaml.
- **TypeScript project references**: Parse references[].path from tsconfig.json.
- **pnpm-workspace.yaml**: Parse packages patterns from pnpm's workspace config.
- **Gradle multi-project**: Parse include() from settings.gradle(.kts) with colon-to-slash path conversion.
- **Git root caching**: Cache findGitRoot results across sibling checks.
- **Yarn Berry link:/portal:**: Parse link: and portal: protocols in package.json.
- **uv Python workspace**: Parse [tool.uv.workspace] members from pyproject.toml.
- **Maven multi-module**: Parse pom.xml <modules> blocks.
- **.NET solution**: Parse .sln project references with Windows path conversion.
- **PHP Composer**: Parse path repository URLs from composer.json.
- **Flutter/Dart**: Parse pubspec.yaml path: dependencies.
- **Swift PM**: Parse Package.swift .package(path:) local deps.
- **Expanded PROJECT_MARKERS**: Added build.gradle.kts, deno.json, project.json, Package.swift, pubspec.yaml, composer.json, .csproj/.fsproj.
- **Depth limits**: 10-level cap on findGitRoot and findWorkspaceRoot.
- **Elixir mix.exs path deps**: Parse {:dep, path: "..."} from mix.exs.
- **Pre-scan optimization**: Single readdirSync per cwd + per findWorkspaceRoot level, skip collectors whose trigger files don't exist. Latency 1.85→0.78ms.
- **Adversarial scenarios**: special chars in names, malformed configs, overlapping workspace configs, no-git projects.
- **38 scenarios**: monorepo, sibling projects, git submodules, Rails/Gemfile, Rust workspace, Python monorepo, extensions, Go workspace, nested monorepo, mixed signals, lone project, turborepo, Elixir umbrella, cross-ref workspace, deep nesting, false-positive trap, Docker Compose, TS project refs, pnpm workspace, Gradle multi-project, combo heuristics, Nx monorepo, Maven, cwd-as-workspace-root, Yarn Berry, uv workspace, .NET solution, PHP Composer, precision stress, symlinked dep, Flutter, nested workspaces, Swift PM.
- **Integration**: `/add-dir` shows interactive picker with suggestions, `/suggest-dirs` command.

## Key Insights
- Sibling count threshold (>3 = "projects folder") is the critical heuristic for precision
- Git root sharing is the strongest signal for sibling relevance
- Context files (AGENTS.md/CLAUDE.md) should always boost a suggestion regardless of other signals
- Ancestor exclusion is essential for deeply nested cwds
- Multi-heuristic deduplication + weight merging lets the scoring naturally surface the most important dirs
- pnpm, Gradle, and Go workspaces each use distinct config files — can't rely on package.json alone
