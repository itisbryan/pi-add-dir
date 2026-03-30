# Autoresearch Ideas: Directory Suggestions

## Remaining ideas (low priority)
- **Bazel/Buck targets**: Parse BUILD files for local dependency references — very niche ecosystem
- **Import graph analysis**: Parse actual import statements to find referenced paths — complex, slow, fragile
- **Maven POM parent/module references**: Parse `pom.xml` for `<modules>` and `<parent>` — would cover JVM Maven projects

## Completed ✅
- ~~Docker compose references~~ ✅ (run 9)
- ~~Caching git root lookups~~ ✅ (run 8)
- ~~pnpm-workspace.yaml~~ ✅ (run 14)
- ~~Gradle multi-project~~ ✅ (run 15)
- ~~TypeScript project references~~ ✅ (run 12)
- ~~Nx monorepo~~ ✅ covered by existing npm workspaces (run 19)
- ~~Lerna~~ ✅ covered by existing npm workspaces (Lerna uses package.json workspaces)
- ~~isProject perf optimization~~ ✅ single statSync (run 18)

## Not worth pursuing
- ~~.env references~~ — unlikely to contain useful directory paths
- ~~Recently opened in editor~~ — platform-specific, fragile, privacy concern
- ~~Parallel heuristic scanning~~ — not needed, each is <1ms
