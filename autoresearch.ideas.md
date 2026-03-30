# Autoresearch Ideas: Directory Suggestions

## Remaining ideas (very niche / diminishing returns)
- **Bazel/Buck targets**: Parse BUILD files for local dep references — very niche
- **Import graph analysis**: Parse actual import statements — complex, slow, fragile
- **Swift PM local deps**: Parse Package.swift for `.package(path: "...")` — niche
- **Elixir mix.exs path deps**: Parse `{:dep, path: "..."}` — niche

## All completed ✅
Smart sibling filtering, ancestor exclusion, git root caching, Docker compose,
TypeScript project refs, pnpm-workspace.yaml, Gradle multi-project, isProject optimization,
Nx (covered by npm ws), Maven POM modules, Lerna (covered by npm ws), Yarn Berry link:/portal:,
uv Python workspace, Package.swift/pubspec.yaml markers, .NET solution, PHP Composer,
depth limits, marker reordering, Flutter/Dart pubspec paths, nested workspaces,
precision stress test, symlinked deps

## Not worth pursuing
- .env references, recently opened in editor, parallel heuristic scanning
