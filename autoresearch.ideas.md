# Autoresearch Ideas: Directory Suggestions

## Remaining ideas (low priority / niche)
- **Bazel/Buck targets**: Parse BUILD files for local dependency references — very niche
- **Import graph analysis**: Parse actual import statements — complex, slow, fragile
- **Swift Package Manager local deps**: Parse Package.swift for `.package(path: "...")` — niche but could help iOS devs
- **Flutter pub workspace**: Parse `pubspec.yaml` for path deps — Dart/Flutter ecosystem

## Completed ✅
- ~~Docker compose references~~ ✅ (run 9)
- ~~Caching git root lookups~~ ✅ (run 8)
- ~~pnpm-workspace.yaml~~ ✅ (run 14)
- ~~Gradle multi-project~~ ✅ (run 15)
- ~~TypeScript project references~~ ✅ (run 12)
- ~~Nx monorepo~~ ✅ covered by npm workspaces (run 19)
- ~~Lerna~~ ✅ covered by npm workspaces
- ~~isProject perf optimization~~ ✅ single statSync (run 18)
- ~~Maven POM modules~~ ✅ (run 20)
- ~~Yarn Berry link:/portal:~~ ✅ (run 25)
- ~~uv Python workspace~~ ✅ (run 26)
- ~~Marker reordering~~ ✅ (run 24)
- ~~Package.swift / pubspec.yaml markers~~ ✅ (this session)

## Not worth pursuing
- ~~.env references~~ — unlikely to contain useful directory paths
- ~~Recently opened in editor~~ — platform-specific, fragile, privacy concern
- ~~Parallel heuristic scanning~~ — not needed, each is <1ms
