# Autoresearch Ideas: Directory Suggestions

## High-value (real-world gaps)
- **pnpm-workspace.yaml support**: pnpm uses its own workspace config (`pnpm-workspace.yaml`), not `package.json` workspaces. Very common in modern monorepos. Both `findWorkspaceRoot` and `collectWorkspaceMembers` need updates.
- **Nx/Lerna project discovery**: Nx uses `project.json` per package + `nx.json` at root. Lerna uses `lerna.json`. Both often also have `package.json` workspaces, so may be partially covered already.
- **Gradle multi-project**: Parse `settings.gradle(.kts)` for `include()` project paths. Common in Android/JVM monorepos.

## Lower priority
- **Bazel/Buck targets**: Parse BUILD files for local dependency references — niche ecosystem
- **Import graph analysis**: Parse actual import statements to find referenced paths — complex, slow, fragile
- **Parallel heuristic scanning**: Use `Promise.all` for collectors — not needed, each is <1ms

## Pruned (already done or not worth pursuing)
- ~~Docker compose references~~ ✅ done (run 9)
- ~~Caching git root lookups~~ ✅ done (run 8)  
- ~~.env references~~ — unlikely to contain useful directory paths
- ~~Recently opened in editor~~ — platform-specific, fragile, privacy concern
