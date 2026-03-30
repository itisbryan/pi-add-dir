# Changelog

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
