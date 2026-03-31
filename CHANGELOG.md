# Changelog

## 1.3.0

### Label-Based Directory Resolution & Interactive Suggestions

- **feat:** `/add-dir xshop` now resolves labels from suggestions — no need to type full paths after seeing `/suggest-dirs`
- **feat:** `/suggest-dirs` is now interactive — pick a directory and it's added immediately
- **feat:** `add_directory` LLM tool supports label resolution — subagents can pass `{path: "xshop"}` instead of absolute paths
- **refactor:** Extracted `resolveInputPath` helper shared across commands and tools
- **fix:** Release workflow — `generate_release_notes` was overriding `body_path`, changelog now appears in GitHub releases

## 1.2.1

- **fix:** Ship `.npmrc` with `omit=dev` — prevents 259 devDependency packages from being installed alongside the extension. Zero runtime dependencies.

## 1.2.0

### Smart Directory Suggestions

- **feat:** `/add-dir` without arguments now shows an interactive picker with smart suggestions
- **feat:** New `/suggest-dirs` command to list all suggestions with relevance scores
- **feat:** Suggestion engine with 18 heuristic sources across 16 ecosystems:
  - **Workspaces:** npm, pnpm (`pnpm-workspace.yaml`), Cargo, Go (`go.work`), uv Python (`[tool.uv.workspace]`)
  - **Local deps:** npm `file:`/`link:`/`portal:`, Gemfile `path:`, Cargo `path =`, Python `file:`, Composer `path`, pubspec.yaml `path:`, Swift PM `.package(path:)`, Elixir `{:dep, path:}`
  - **Build tools:** Gradle `include()`, Maven `<modules>`, TypeScript project references, Docker Compose `build.context`
  - **SCM:** Git submodules (`.gitmodules`)
  - **Project detection:** Sibling projects with smart filtering (git root sharing, context file boost, >3 threshold)
- **feat:** Context file boost — directories with `AGENTS.md`/`CLAUDE.md`/skills get higher scores
- **feat:** Ancestor exclusion — won't suggest a directory you're already inside
- **perf:** Pre-scan optimization — single `readdirSync` per directory level instead of per-file stat calls
- **perf:** Git root caching — avoids redundant upward walks for sibling checks
- **feat:** Improved Ruby support — `Rakefile` project marker, `path:` matched anywhere in gem options, `gemspec path:` directive parsing
- **test:** 62 unit tests + 43 benchmark scenarios, F1=1.0 precision/recall

## 1.1.0

### Hardening & Polish

- **fix:** Widget now truncates to terminal width — prevents TUI crash when dir labels exceed available space
- **fix:** Removed `_add-dir-reload` internal command from autocomplete — reload now uses `sendMessage` + `sendUserMessage`
- **fix:** Temp state files (`/tmp/pi-add-dir-*.json`) are cleaned up on `session_shutdown`
- **fix:** Removed emoji from extension hint text to avoid pi-powerline-footer width overflow
- **feat:** Context injection is cached — filesystem is only re-scanned when directories change, not every turn
- **feat:** `/remove-dir` now supports tab-completion for added directory labels/paths
- **chore:** Added LICENSE file (MIT)
- **chore:** Fixed README install URL (was hardcoded local path)
- **chore:** Updated `.gitignore` to include `node_modules` and `dist`

## 1.0.1

### Fix Limitations (#1)

- **feat:** External skills now register as native `/skill:name` commands via `resources_discover`
- **feat:** New `search_external_files` LLM tool — search files across all external directories
- **feat:** Extension detection — scans `.pi/extensions/` and shows setup instructions
- **fix:** Auto-reload when adding/removing dirs with skills

## 1.0.0

### Initial Release

- `/add-dir`, `/remove-dir`, `/dirs` commands
- `add_directory` LLM tool
- System prompt injection for AGENTS.md, CLAUDE.md, and skills
- Widget showing active external directories
- Session persistence via `appendEntry`
