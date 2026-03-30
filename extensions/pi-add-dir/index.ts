/**
 * pi-add-dir — Add external directories to your pi session.
 *
 * Loads AGENTS.md / CLAUDE.md and discovers skills from added directories,
 * injecting them into the system prompt every turn. Persists across restarts.
 *
 * Commands:
 *   /add-dir <path>     — add an external directory
 *   /remove-dir [path]  — remove a directory (interactive if no path)
 *   /dirs               — list all added directories
 *
 * Tool:
 *   add_directory       — lets the LLM request adding a directory
 *
 * Widget:
 *   Shows active external directories above the editor
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddedDir {
  /** Absolute path to the directory */
  absolutePath: string;
  /** Display label (basename or user-provided alias) */
  label: string;
  /** Timestamp when added */
  addedAt: number;
}

interface DirContext {
  /** Path to the directory */
  dir: string;
  /** Content of AGENTS.md if found */
  agentsMd: string | null;
  /** Content of CLAUDE.md if found */
  claudeMd: string | null;
  /** Skills discovered (name → SKILL.md content) */
  skills: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md"];

// Directories where skills live, relative to a project root
const SKILL_DIRS = [
  ".pi/skills",
  ".agents/skills",
  ".claude/skills",
];

function resolveDir(input: string, cwd: string): string {
  const resolved = path.isAbsolute(input) ? input : path.resolve(cwd, input);
  // Normalize trailing slashes and resolve symlinks where possible
  try {
    return fs.realpathSync(resolved);
  } catch {
    return path.resolve(resolved);
  }
}

function dirExists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Scan a directory for context files (AGENTS.md, CLAUDE.md) and skills.
 */
function scanDirContext(dir: string): DirContext {
  const ctx: DirContext = {
    dir,
    agentsMd: null,
    claudeMd: null,
    skills: new Map(),
  };

  // Read context files from root and .pi/ subdirectory
  for (const name of CONTEXT_FILES) {
    const content = readFileSafe(path.join(dir, name));
    if (name === "AGENTS.md") ctx.agentsMd = content;
    if (name === "CLAUDE.md") ctx.claudeMd = content;
  }

  // Also check .pi/ subdirectory for context files
  for (const name of CONTEXT_FILES) {
    const piContent = readFileSafe(path.join(dir, ".pi", name));
    if (piContent) {
      if (name === "AGENTS.md") ctx.agentsMd = (ctx.agentsMd ?? "") + "\n\n" + piContent;
      if (name === "CLAUDE.md") ctx.claudeMd = (ctx.claudeMd ?? "") + "\n\n" + piContent;
    }
  }

  // Discover skills
  for (const skillDir of SKILL_DIRS) {
    const fullSkillDir = path.join(dir, skillDir);
    if (!dirExists(fullSkillDir)) continue;

    try {
      const entries = fs.readdirSync(fullSkillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMd = readFileSafe(path.join(fullSkillDir, entry.name, "SKILL.md"));
        if (skillMd) {
          ctx.skills.set(entry.name, skillMd);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return ctx;
}

/**
 * Build the system prompt injection from all added directories.
 */
function buildContextInjection(dirs: AddedDir[]): string {
  if (dirs.length === 0) return "";

  const sections: string[] = [];
  sections.push("\n\n## External Directories (added via pi-add-dir)");
  sections.push(`\nThe following ${dirs.length} external director${dirs.length === 1 ? "y is" : "ies are"} included in this session. You can read, edit, and write files in these directories using absolute paths.\n`);

  for (const dir of dirs) {
    const ctx = scanDirContext(dir.absolutePath);
    sections.push(`### 📁 ${dir.label} — \`${dir.absolutePath}\``);

    // Context files
    if (ctx.agentsMd) {
      sections.push(`\n#### AGENTS.md (from ${dir.label})\n${ctx.agentsMd}`);
    }
    if (ctx.claudeMd) {
      sections.push(`\n#### CLAUDE.md (from ${dir.label})\n${ctx.claudeMd}`);
    }

    // Skills
    if (ctx.skills.size > 0) {
      sections.push(`\n#### Skills discovered in ${dir.label}:`);
      for (const [name, content] of ctx.skills) {
        // Extract just the YAML frontmatter description for the listing
        const descMatch = content.match(/^---\n[\s\S]*?description:\s*>?\s*\n?\s*(.*?)(?:\n---|\n\w)/m);
        const desc = descMatch?.[1]?.trim() ?? "No description";
        sections.push(`- **${name}**: ${desc}`);
      }
      sections.push(`\nTo use a skill from ${dir.label}, read its SKILL.md at \`${dir.absolutePath}/.pi/skills/<name>/SKILL.md\` (or .agents/skills/).`);
    }

    // Summary of directory contents (lightweight — just top-level listing)
    try {
      const entries = fs.readdirSync(dir.absolutePath, { withFileTypes: true });
      const topLevel = entries
        .filter(e => !e.name.startsWith(".") || e.name === ".pi" || e.name === ".agents")
        .slice(0, 20)
        .map(e => `${e.isDirectory() ? "📂" : "📄"} ${e.name}`);
      if (topLevel.length > 0) {
        sections.push(`\n<details><summary>Top-level contents</summary>\n\n${topLevel.join("\n")}\n</details>`);
      }
    } catch {
      // Skip if unreadable
    }
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function addDirExtension(pi: ExtensionAPI) {
  // Per-session state
  let addedDirs: AddedDir[] = [];

  const getSessionKey = (ctx: ExtensionContext) => ctx.sessionManager.getSessionId();

  // -----------------------------------------------------------------------
  // State reconstruction
  // -----------------------------------------------------------------------

  function reconstructState(ctx: ExtensionContext) {
    addedDirs = [];

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom") continue;
      if (entry.customType === "add-dir:state") {
        addedDirs = (entry.data as { dirs: AddedDir[] })?.dirs ?? [];
      }
    }

    updateWidget(ctx);
  }

  function persistState() {
    pi.appendEntry("add-dir:state", { dirs: addedDirs });
  }

  // -----------------------------------------------------------------------
  // Widget
  // -----------------------------------------------------------------------

  function updateWidget(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    if (addedDirs.length === 0) {
      ctx.ui.setWidget("add-dir", undefined);
      return;
    }

    ctx.ui.setWidget("add-dir", (_tui, theme) => {
      const parts = [
        theme.fg("accent", "📂"),
        theme.fg("muted", ` ${addedDirs.length} external dir${addedDirs.length === 1 ? "" : "s"}`),
        theme.fg("dim", " │ "),
      ];

      const dirLabels = addedDirs.map(d => theme.fg("text", d.label)).join(theme.fg("dim", ", "));
      parts.push(dirLabels);
      parts.push(theme.fg("dim", "  (/dirs to manage)"));

      return new Text(parts.join(""), 0, 0);
    });
  }

  // -----------------------------------------------------------------------
  // Core operations
  // -----------------------------------------------------------------------

  function addDir(dirPath: string, cwd: string, ctx: ExtensionContext): { ok: boolean; message: string } {
    const absolutePath = resolveDir(dirPath, cwd);

    if (!dirExists(absolutePath)) {
      return { ok: false, message: `Directory does not exist: ${absolutePath}` };
    }

    // Check for duplicates
    if (addedDirs.some(d => d.absolutePath === absolutePath)) {
      return { ok: false, message: `Already added: ${absolutePath}` };
    }

    // Check it's not the current cwd
    const resolvedCwd = resolveDir(cwd, cwd);
    if (absolutePath === resolvedCwd) {
      return { ok: false, message: `That's the current working directory — already in scope.` };
    }

    const label = path.basename(absolutePath);
    addedDirs.push({ absolutePath, label, addedAt: Date.now() });
    persistState();
    updateWidget(ctx);

    // Report what was found
    const dirCtx = scanDirContext(absolutePath);
    const found: string[] = [];
    if (dirCtx.agentsMd) found.push("AGENTS.md");
    if (dirCtx.claudeMd) found.push("CLAUDE.md");
    if (dirCtx.skills.size > 0) found.push(`${dirCtx.skills.size} skill(s)`);

    const foundStr = found.length > 0 ? ` Found: ${found.join(", ")}.` : " No context files found.";
    return { ok: true, message: `Added ${label} (${absolutePath}).${foundStr}` };
  }

  function removeDir(absolutePath: string, ctx: ExtensionContext): { ok: boolean; message: string } {
    const idx = addedDirs.findIndex(d => d.absolutePath === absolutePath);
    if (idx === -1) {
      return { ok: false, message: `Not found: ${absolutePath}` };
    }

    const removed = addedDirs.splice(idx, 1)[0];
    persistState();
    updateWidget(ctx);
    return { ok: true, message: `Removed ${removed.label} (${removed.absolutePath}).` };
  }

  // -----------------------------------------------------------------------
  // Session events
  // -----------------------------------------------------------------------

  pi.on("session_start", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_switch", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_fork", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_e, ctx) => reconstructState(ctx));

  // -----------------------------------------------------------------------
  // System prompt injection
  // -----------------------------------------------------------------------

  pi.on("before_agent_start", async (event, _ctx) => {
    if (addedDirs.length === 0) return;

    const injection = buildContextInjection(addedDirs);
    return {
      systemPrompt: event.systemPrompt + injection,
    };
  });

  // -----------------------------------------------------------------------
  // Commands
  // -----------------------------------------------------------------------

  pi.registerCommand("add-dir", {
    description: "Add an external directory to this session",
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        // Interactive: ask for path
        const inputPath = await ctx.ui.input("Directory path:", "");
        if (!inputPath) return;
        const result = addDir(inputPath, ctx.cwd, ctx);
        ctx.ui.notify(result.message, result.ok ? "info" : "error");
        return;
      }

      const result = addDir(args.trim(), ctx.cwd, ctx);
      ctx.ui.notify(result.message, result.ok ? "info" : "error");
    },
  });

  pi.registerCommand("remove-dir", {
    description: "Remove an external directory from this session",
    handler: async (args, ctx) => {
      if (addedDirs.length === 0) {
        ctx.ui.notify("No external directories added.", "info");
        return;
      }

      if (args?.trim()) {
        const absolutePath = resolveDir(args.trim(), ctx.cwd);
        const result = removeDir(absolutePath, ctx);
        ctx.ui.notify(result.message, result.ok ? "info" : "error");
        return;
      }

      // Interactive: pick from list
      const choices = addedDirs.map(d => `${d.label} — ${d.absolutePath}`);
      const selected = await ctx.ui.select("Remove which directory?", choices);
      if (selected === undefined) return;

      const dir = addedDirs[selected];
      if (!dir) return;

      const result = removeDir(dir.absolutePath, ctx);
      ctx.ui.notify(result.message, result.ok ? "info" : "error");
    },
  });

  pi.registerCommand("dirs", {
    description: "List all external directories in this session",
    handler: async (_args, ctx) => {
      if (addedDirs.length === 0) {
        ctx.ui.notify("No external directories added. Use /add-dir <path> to add one.", "info");
        return;
      }

      const lines: string[] = [`External directories (${addedDirs.length}):\n`];
      for (const dir of addedDirs) {
        const dirCtx = scanDirContext(dir.absolutePath);
        const badges: string[] = [];
        if (dirCtx.agentsMd) badges.push("AGENTS.md");
        if (dirCtx.claudeMd) badges.push("CLAUDE.md");
        if (dirCtx.skills.size > 0) badges.push(`${dirCtx.skills.size} skills`);

        lines.push(`  📂 ${dir.label}`);
        lines.push(`     ${dir.absolutePath}`);
        if (badges.length > 0) {
          lines.push(`     Found: ${badges.join(", ")}`);
        }
        lines.push("");
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // -----------------------------------------------------------------------
  // LLM Tool — lets the agent request adding a directory
  // -----------------------------------------------------------------------

  pi.registerTool({
    name: "add_directory",
    label: "Add Directory",
    description:
      "Add an external directory to this session so its AGENTS.md, CLAUDE.md, and skills are loaded into context. " +
      "Use this when you need to reference or work with code in a directory outside the current working directory.",
    promptSnippet: "Add an external directory to this session (loads its AGENTS.md, skills, etc.)",
    promptGuidelines: [
      "Use add_directory when you need context from another project or directory outside cwd.",
      "The directory's AGENTS.md and CLAUDE.md are injected into the system prompt automatically.",
      "After adding, you can read/edit/write files in that directory using absolute paths.",
    ],
    parameters: Type.Object({
      path: Type.String({
        description: "Absolute or relative path to the directory to add",
      }),
      reason: Type.Optional(
        Type.String({
          description: "Why this directory is being added (shown to user)",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dirPath = params.path.replace(/^@/, ""); // Strip @ prefix (some models add it)
      const result = addDir(dirPath, ctx.cwd, ctx);

      if (!result.ok) {
        throw new Error(result.message);
      }

      // Build a useful response for the LLM
      const dirCtx = scanDirContext(resolveDir(dirPath, ctx.cwd));
      const response: string[] = [result.message];

      if (dirCtx.agentsMd) {
        response.push("\nAGENTS.md content has been injected into system context.");
      }
      if (dirCtx.claudeMd) {
        response.push("CLAUDE.md content has been injected into system context.");
      }
      if (dirCtx.skills.size > 0) {
        response.push(`\nDiscovered skills: ${[...dirCtx.skills.keys()].join(", ")}`);
      }
      response.push(`\nYou can now access files at: ${resolveDir(dirPath, ctx.cwd)}`);

      return {
        content: [{ type: "text", text: response.join("\n") }],
        details: {
          directory: resolveDir(dirPath, ctx.cwd),
          hasAgentsMd: !!dirCtx.agentsMd,
          hasClaudeMd: !!dirCtx.claudeMd,
          skillCount: dirCtx.skills.size,
          skillNames: [...dirCtx.skills.keys()],
        },
      };
    },

    renderCall(args, theme, _context) {
      const dirPath = args.path?.replace(/^@/, "") ?? "";
      let text = theme.fg("toolTitle", theme.bold("add_directory "));
      text += theme.fg("accent", dirPath);
      if (args.reason) {
        text += theme.fg("dim", ` — ${args.reason}`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as {
        directory?: string;
        hasAgentsMd?: boolean;
        hasClaudeMd?: boolean;
        skillCount?: number;
        skillNames?: string[];
      } | undefined;

      if (!details) {
        const content = result.content?.[0];
        const text = content && "text" in content ? content.text : "Done";
        return new Text(theme.fg("success", `✓ ${text}`), 0, 0);
      }

      const parts: string[] = [];
      parts.push(theme.fg("success", `✓ Added ${path.basename(details.directory ?? "")}`));

      const badges: string[] = [];
      if (details.hasAgentsMd) badges.push(theme.fg("accent", "AGENTS.md"));
      if (details.hasClaudeMd) badges.push(theme.fg("accent", "CLAUDE.md"));
      if (details.skillCount && details.skillCount > 0) {
        badges.push(theme.fg("warning", `${details.skillCount} skills`));
      }
      if (badges.length > 0) {
        parts.push(theme.fg("dim", " │ ") + badges.join(theme.fg("dim", ", ")));
      }

      if (expanded && details.skillNames && details.skillNames.length > 0) {
        parts.push("\n" + theme.fg("muted", "  Skills: ") + details.skillNames.map(s => theme.fg("text", s)).join(", "));
      }

      return new Text(parts.join(""), 0, 0);
    },
  });
}
