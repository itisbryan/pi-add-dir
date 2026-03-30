<div align="center">

# pi-add-dir

### Add external directories to your pi session

**[Install](#install)** · **[Usage](#usage)** · **[How it works](#how-it-works)**

</div>

Add directories from outside your current working directory to a pi session. Their `AGENTS.md`, `CLAUDE.md`, and skills are automatically loaded into context every turn — so the agent understands both projects at once.

---

## Install

```bash
pi install /Users/itisbryan/Desktop/personal/pi-add-dir
```

Or from a git repo (once published):

```bash
pi install https://github.com/youruser/pi-add-dir
```

Then `/reload` in pi.

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/add-dir <path>` | Add an external directory to this session |
| `/add-dir` | Interactive mode — prompts for a path |
| `/remove-dir [path]` | Remove a directory (interactive picker if no path) |
| `/dirs` | List all added directories with their detected context |

### Examples

```
/add-dir /Users/me/other-project
/add-dir ../shared-library
/add-dir ~/Desktop/design-system
/dirs
/remove-dir /Users/me/other-project
```

### LLM Tool

The agent can also request adding a directory on its own via the `add_directory` tool:

> "I need to reference the shared library at /Users/me/libs/core — let me add it to the session."

The tool appears in the system prompt and the agent can call it when it needs cross-project context.

### Widget

When directories are added, a widget appears above the editor:

```
📂 2 external dirs │ other-project, shared-library  (/dirs to manage)
```

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  pi session (cwd: /my-project)                      │
│                                                     │
│  /add-dir /other-project                            │
│     │                                               │
│     ├─► Scans /other-project for:                   │
│     │     AGENTS.md, CLAUDE.md                      │
│     │     .pi/skills/, .agents/skills/              │
│     │                                               │
│     ├─► Persists to session (survives restart)      │
│     │                                               │
│     └─► Every turn: injects found context files     │
│         into the system prompt via                   │
│         before_agent_start event                    │
│                                                     │
│  Agent now knows both projects' rules & conventions │
│  Agent can read/edit/write files in /other-project  │
│  using absolute paths (always worked — now it has   │
│  the context to do it intelligently)                │
└─────────────────────────────────────────────────────┘
```

### What gets injected

For each added directory, the extension reads:

| File | Location(s) checked |
|------|---------------------|
| `AGENTS.md` | `<dir>/AGENTS.md`, `<dir>/.pi/AGENTS.md` |
| `CLAUDE.md` | `<dir>/CLAUDE.md`, `<dir>/.pi/CLAUDE.md` |
| Skills | `<dir>/.pi/skills/*/SKILL.md`, `<dir>/.agents/skills/*/SKILL.md`, `<dir>/.claude/skills/*/SKILL.md` |

These are appended to the system prompt on every turn, so the agent always has full context.

### What's persisted

Added directories are stored in the session via `pi.appendEntry()`. When you `/resume` a session, the directories are automatically restored.

## Limitations

| Works ✅ | Doesn't work ❌ |
|---|---|
| AGENTS.md / CLAUDE.md loaded into system prompt | `@` file fuzzy search doesn't include external dirs |
| Skills discovered and listed in prompt | External skills don't register as `/skill:name` commands |
| Agent can read/edit/write any path | External `.pi/extensions/` are not loaded |
| Persists across session restarts | Can't change `ctx.cwd` at runtime |

## License

MIT
