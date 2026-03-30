# Autoresearch Ideas: Directory Suggestions

## Remaining ideas (diminishing returns)
- **Bazel/Buck targets**: Parse BUILD files for local dependency references — very niche
- **Import graph analysis**: Parse actual import statements — complex, slow, fragile
- **Flutter pub path deps**: Parse `pubspec.yaml` for `path:` dependencies — Dart/Flutter ecosystem
- **Swift PM local deps**: Parse Package.swift for `.package(path: "...")` — niche

## Completed ✅ (see git log for details)
- Smart sibling filtering (run 2)
- Ancestor exclusion (run 7)
- Git root caching (run 8)
- Docker compose (run 9)
- TypeScript project refs (run 12)
- pnpm-workspace.yaml (run 14)
- Gradle multi-project (run 15)
- isProject optimization (run 18)
- Nx monorepo (run 19 — covered by npm workspaces)
- Maven POM modules (run 20)
- Lerna (covered by npm workspaces)
- Yarn Berry link:/portal: (run 25)
- uv Python workspace (run 26)
- Package.swift/pubspec.yaml markers (run 27)
- .NET solution (run 29)
- PHP Composer (run 31)
- Depth limits (run 28)
- Marker reordering (run 24)

## Not worth pursuing
- .env references, recently opened in editor, parallel heuristic scanning
