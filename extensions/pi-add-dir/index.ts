/**
 * pi-add-dir — Add external directories to your pi session.
 *
 * Loads AGENTS.md / CLAUDE.md and discovers skills from added directories,
 * injecting them into the system prompt every turn. Persists across restarts.
 *
 * Skills from external directories are registered natively via the
 * `resources_discover` event, making them available as `/skill:name` commands.
 *
 * Commands:
 *   /add-dir <path>     — add an external directory
 *   /add-dir            — interactive mode with suggestions
 *   /suggest-dirs       — show directory suggestions
 *   /remove-dir [path]  — remove a directory (interactive if no path)
 *   /dirs               — list all added directories
 *
 * Tools:
 *   add_directory           — lets the LLM request adding a directory
 *   search_external_files   — search for files across all external directories
 *
 * Widget:
 *   Shows active external directories above the editor
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { suggestDirectories } from "./suggestions.js";

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
  /** Skills discovered (name → SKILL.md absolute path) */
  skillPaths: Map<string, string>;
  /** Skills discovered (name → SKILL.md content) */
  skills: Map<string, string>;
  /** Extensions found in .pi/extensions/ */
  extensionPaths: string[];
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

// Extension directories to scan, relative to a project root
const EXTENSION_DIRS = [
  ".pi/extensions",
];

function resolveDir(input: string, cwd: string): string {
  const resolved = path.isAbsolute(input) ? input : path.resolve(cwd, input);
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
 * Generate a deterministic hash for a cwd to use as a temp file key.
 */
function cwdHash(cwd: string): string {
  return crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 12);
}

/**
 * Path to the temp state file used by resources_discover.
 * Keyed by cwd so different projects don't share state.
 */
function getTempStatePath(cwd: string): string {
  return path.join(os.tmpdir(), `pi-add-dir-${cwdHash(cwd)}.json`);
}

/**
 * Write directory list to the temp state file so resources_discover can read it.
 */
function writeTempState(cwd: string, dirs: AddedDir[]): void {
  try {
    fs.writeFileSync(getTempStatePath(cwd), JSON.stringify({ dirs }), "utf-8");
  } catch {
    // Non-critical — temp state is a performance optimization
  }
}

/**
 * Read directory list from the temp state file.
 */
function readTempState(cwd: string): AddedDir[] {
  try {
    const content = fs.readFileSync(getTempStatePath(cwd), "utf-8");
    const data = JSON.parse(content) as { dirs?: AddedDir[] };
    return data.dirs ?? [];
  } catch {
    return [];
  }
}

/**
 * Remove the temp state file for a given cwd.
 */
function removeTempState(cwd: string): void {
  try {
    fs.unlinkSync(getTempStatePath(cwd));
  } catch {
    // Already gone or never existed
  }
}

/**
 * Scan a directory for context files (AGENTS.md, CLAUDE.md), skills, and extensions.
 */
function scanDirContext(dir: string): DirContext {
  const ctx: DirContext = {
    dir,
    agentsMd: null,
    claudeMd: null,
    skillPaths: new Map(),
    skills: new Map(),
    extensionPaths: [],
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
        const skillMdPath = path.join(fullSkillDir, entry.name, "SKILL.md");
        const skillMd = readFileSafe(skillMdPath);
        if (skillMd) {
          ctx.skillPaths.set(entry.name, skillMdPath);
          ctx.skills.set(entry.name, skillMd);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  // Discover extensions
  for (const extDir of EXTENSION_DIRS) {
    const fullExtDir = path.join(dir, extDir);
    if (!dirExists(fullExtDir)) continue;

    try {
      const entries = fs.readdirSync(fullExtDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".ts")) {
          ctx.extensionPaths.push(path.join(fullExtDir, entry.name));
        } else if (entry.isDirectory()) {
          const indexPath = path.join(fullExtDir, entry.name, "index.ts");
          if (readFileSafe(indexPath) !== null) {
            ctx.extensionPaths.push(indexPath);
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return ctx;
}

/**
 * Collect all SKILL.md paths from a list of directories.
 */
function collectSkillPaths(dirs: AddedDir[]): string[] {
  const skillPaths: string[] = [];
  for (const dir of dirs) {
    if (!dirExists(dir.absolutePath)) continue;
    for (const skillDir of SKILL_DIRS) {
      const fullSkillDir = path.join(dir.absolutePath, skillDir);
      if (!dirExists(fullSkillDir)) continue;
      try {
        const entries = fs.readdirSync(fullSkillDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillMdPath = path.join(fullSkillDir, entry.name, "SKILL.md");
          if (readFileSafe(skillMdPath) !== null) {
            skillPaths.push(skillMdPath);
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }
  }
  return skillPaths;
}

// ---------------------------------------------------------------------------
// Context injection cache — avoids re-scanning the filesystem every turn
// ---------------------------------------------------------------------------

let contextCache: { dirs: string; injection: string } | null = null;

/**
 * Invalidate the context injection cache.
 * Called when dirs are added/removed so the next turn re-scans.
 */
function invalidateContextCache(): void {
  contextCache = null;
}

/**
 * Build the system prompt injection from all added directories.
 * Cached by directory list — only re-scans when dirs change.
 */
function buildContextInjection(dirs: AddedDir[]): string {
  if (dirs.length === 0) return "";

  // Cache key: sorted absolute paths
  const cacheKey = dirs.map(d => d.absolutePath).sort().join("\0");
  if (contextCache && contextCache.dirs === cacheKey) {
    return contextCache.injection;
  }

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

    // Skills — now registered natively, just mention them
    if (ctx.skills.size > 0) {
      sections.push(`\n#### Skills from ${dir.label} (registered as /skill:name commands):`);
      for (const [name, content] of ctx.skills) {
        const descMatch = content.match(/^---\n[\s\S]*?description:\s*>?\s*\n?\s*(.*?)(?:\n---|\n\w)/m);
        const desc = descMatch?.[1]?.trim() ?? "No description";
        sections.push(`- **${name}**: ${desc} — use \`/skill:${name}\` or read \`${ctx.skillPaths.get(name)}\``);
      }
    }

    // Summary of directory contents
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

  const injection = sections.join("\n");
  contextCache = { dirs: cacheKey, injection };
  return injection;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function addDirExtension(pi: ExtensionAPI) {
  // Per-session state
  let addedDirs: AddedDir[] = [];

  // Track the cwd for temp state file operations
  let currentCwd: string = "";

  // -----------------------------------------------------------------------
  // Resources discovery — register external skills natively
  // -----------------------------------------------------------------------

  // This event fires before session_start, so we read from a temp file
  // that was written when dirs were added/removed. This allows skills from
  // external directories to be discovered as proper /skill:name commands.
  pi.on("resources_discover", (event, _ctx) => {
    const dirs = readTempState(event.cwd);
    if (dirs.length === 0) return;

    const skillPaths = collectSkillPaths(dirs);
    if (skillPaths.length === 0) return;

    return { skillPaths };
  });

  // -----------------------------------------------------------------------
  // State reconstruction
  // -----------------------------------------------------------------------

  function reconstructState(ctx: ExtensionContext) {
    addedDirs = [];
    currentCwd = ctx.cwd;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom") continue;
      if (entry.customType === "add-dir:state") {
        addedDirs = (entry.data as { dirs: AddedDir[] })?.dirs ?? [];
      }
    }

    // Invalidate cache since we may have switched sessions
    invalidateContextCache();

    // Sync temp state file so resources_discover stays current
    writeTempState(currentCwd, addedDirs);

    updateWidget(ctx);
  }

  function persistState(cwd?: string) {
    pi.appendEntry("add-dir:state", { dirs: addedDirs });
    // Also write to temp file for resources_discover
    const effectiveCwd = cwd || currentCwd;
    if (effectiveCwd) {
      writeTempState(effectiveCwd, addedDirs);
    }
  }

  // -----------------------------------------------------------------------
  // Widget — width-aware to prevent TUI overflow crashes
  // -----------------------------------------------------------------------

  function updateWidget(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    if (addedDirs.length === 0) {
      ctx.ui.setWidget("add-dir", undefined);
      return;
    }

    ctx.ui.setWidget("add-dir", (_tui, theme) => {
      return {
        dispose() {},
        invalidate() {},
        render(width: number): string[] {
          const prefix = theme.fg("accent", "📂");
          const count = theme.fg("muted", ` ${addedDirs.length} external dir${addedDirs.length === 1 ? "" : "s"}`);
          const sep = theme.fg("dim", " │ ");
          const suffix = theme.fg("dim", "  (/dirs to manage)");

          const dirLabels = addedDirs.map(d => theme.fg("text", d.label)).join(theme.fg("dim", ", "));

          const fullLine = ` ${prefix}${count}${sep}${dirLabels}${suffix}`;
          const fullWidth = visibleWidth(fullLine);

          if (fullWidth <= width) {
            return [fullLine];
          }

          // Truncate dir labels to fit — keep prefix/count/sep/suffix, shrink the middle
          const withoutLabels = ` ${prefix}${count}${sep}`;
          const overhead = visibleWidth(withoutLabels) + visibleWidth(suffix);
          const available = width - overhead;

          if (available > 5) {
            const truncatedLabels = truncateToWidth(dirLabels, available, "…");
            return [`${withoutLabels}${truncatedLabels}${suffix}`];
          }

          // Extremely narrow — just show count
          const minimal = ` ${prefix}${count}`;
          return [truncateToWidth(minimal, width, "…")];
        },
      };
    });
  }

  // -----------------------------------------------------------------------
  // Core operations
  // -----------------------------------------------------------------------

  /**
   * Resolve a user-provided input that might be a label (e.g. "xshop")
   * instead of a real path. Checks suggestions for a matching label
   * when the input doesn't resolve to an existing directory.
   */
  function resolveInputPath(input: string, cwd: string): string {
    // If it resolves to an existing dir, use it as-is
    if (dirExists(resolveDir(input, cwd))) return input;

    // If it looks like a plain name (no separators, not relative), check suggestions
    if (!path.isAbsolute(input) && !input.includes(path.sep) && !input.startsWith(".")) {
      const suggestions = suggestDirectories({
        cwd,
        alreadyAdded: addedDirs.map(d => d.absolutePath),
      });
      const match = suggestions.find(s => s.label === input);
      if (match) return match.absolutePath;
    }

    return input;
  }

  function addDir(dirPath: string, cwd: string, ctx: ExtensionContext): {
    ok: boolean;
    message: string;
    hasNewSkills: boolean;
    extensionHints: string[];
  } {
    const absolutePath = resolveDir(dirPath, cwd);

    if (!dirExists(absolutePath)) {
      return { ok: false, message: `Directory does not exist: ${absolutePath}`, hasNewSkills: false, extensionHints: [] };
    }

    // Check for duplicates
    if (addedDirs.some(d => d.absolutePath === absolutePath)) {
      return { ok: false, message: `Already added: ${absolutePath}`, hasNewSkills: false, extensionHints: [] };
    }

    // Check it's not the current cwd
    const resolvedCwd = resolveDir(cwd, cwd);
    if (absolutePath === resolvedCwd) {
      return { ok: false, message: `That's the current working directory — already in scope.`, hasNewSkills: false, extensionHints: [] };
    }

    const label = path.basename(absolutePath);
    addedDirs.push({ absolutePath, label, addedAt: Date.now() });
    invalidateContextCache();
    persistState(cwd);
    updateWidget(ctx);

    // Report what was found
    const dirCtx = scanDirContext(absolutePath);
    const found: string[] = [];
    if (dirCtx.agentsMd) found.push("AGENTS.md");
    if (dirCtx.claudeMd) found.push("CLAUDE.md");
    if (dirCtx.skills.size > 0) found.push(`${dirCtx.skills.size} skill(s)`);

    const hasNewSkills = dirCtx.skills.size > 0;

    // Detect extensions and build hints
    const extensionHints: string[] = [];
    if (dirCtx.extensionPaths.length > 0) {
      extensionHints.push(
        `Found ${dirCtx.extensionPaths.length} extension(s) in ${label}/.pi/extensions/.`,
        `   To enable them, add to your settings.json:`,
        `   { "extensions": ["${absolutePath}/.pi/extensions"] }`,
        `   Then /reload to activate.`,
      );
    }

    const foundStr = found.length > 0 ? ` Found: ${found.join(", ")}.` : " No context files found.";
    let message = `Added ${label} (${absolutePath}).${foundStr}`;
    if (hasNewSkills) {
      message += ` Reloading to register skills as /skill:name commands...`;
    }

    return { ok: true, message, hasNewSkills, extensionHints };
  }

  function removeDir(absolutePath: string, ctx: ExtensionContext): {
    ok: boolean;
    message: string;
    hadSkills: boolean;
  } {
    const idx = addedDirs.findIndex(d => d.absolutePath === absolutePath);
    if (idx === -1) {
      return { ok: false, message: `Not found: ${absolutePath}`, hadSkills: false };
    }

    // Check if this dir had skills before removing
    const dirCtx = scanDirContext(absolutePath);
    const hadSkills = dirCtx.skills.size > 0;

    const removed = addedDirs.splice(idx, 1)[0];
    invalidateContextCache();
    persistState();
    updateWidget(ctx);

    let message = `Removed ${removed.label} (${removed.absolutePath}).`;
    if (hadSkills) {
      message += ` Reloading to unregister skills...`;
    }
    return { ok: true, message, hadSkills };
  }

  // -----------------------------------------------------------------------
  // Session events
  // -----------------------------------------------------------------------

  pi.on("session_start", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_switch", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_fork", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_e, ctx) => reconstructState(ctx));

  // Clean up temp state file on shutdown
  pi.on("session_shutdown", async () => {
    if (currentCwd) {
      removeTempState(currentCwd);
    }
  });

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
    description: "Add an external directory to this session (shows suggestions when called without args)",
    handler: async (args, ctx) => {
      let inputPath = args?.trim();

      if (!inputPath) {
        // Show suggestions when called without args
        const suggestions = suggestDirectories({
          cwd: ctx.cwd,
          alreadyAdded: addedDirs.map(d => d.absolutePath),
        });

        if (suggestions.length > 0) {
          const choices = suggestions.map(s => {
            const reasons = s.reasons.slice(0, 2).join(", ");
            return `${s.label} — ${s.absolutePath} (${reasons})`;
          });
          choices.push("📝 Enter a custom path...");

          const selected = await ctx.ui.select("Add directory:", choices);
          if (selected === undefined) return;

          const selectedIdx = choices.indexOf(selected);
          if (selectedIdx === choices.length - 1 || selectedIdx === -1) {
            // Custom path (last option or not found)
            const prompted = await ctx.ui.input("Directory path:", "");
            if (!prompted) return;
            inputPath = prompted;
          } else {
            inputPath = suggestions[selectedIdx].absolutePath;
          }
        } else {
          const prompted = await ctx.ui.input("Directory path (no suggestions found):", "");
          if (!prompted) return;
          inputPath = prompted;
        }
      }

      inputPath = resolveInputPath(inputPath, ctx.cwd);

      const result = addDir(inputPath, ctx.cwd, ctx);
      ctx.ui.notify(result.message, result.ok ? "info" : "error");

      // Show extension hints if any
      if (result.extensionHints.length > 0) {
        ctx.ui.notify(result.extensionHints.join("\n"), "warning");
      }

      // Auto-reload if skills were found so they register as /skill:name
      if (result.ok && result.hasNewSkills) {
        await ctx.reload();
      }
    },
  });

  pi.registerCommand("suggest-dirs", {
    description: "Show directory suggestions based on project structure",
    handler: async (_args, ctx) => {
      const suggestions = suggestDirectories({
        cwd: ctx.cwd,
        alreadyAdded: addedDirs.map(d => d.absolutePath),
      });

      if (suggestions.length === 0) {
        ctx.ui.notify("No suggestions found. Try /add-dir <path> to add manually.", "info");
        return;
      }

      const choices = suggestions.map(s => {
        const score = Math.round(s.score * 100);
        const reasons = s.reasons.slice(0, 2).join(", ");
        return `${s.label} (${score}%) — ${reasons}`;
      });

      const selected = await ctx.ui.select("Suggested directories — pick to add:", choices);
      if (selected === undefined) return;

      const selectedIdx = choices.indexOf(selected);
      if (selectedIdx === -1) return;

      const picked = suggestions[selectedIdx];
      if (!picked) return;

      const result = addDir(picked.absolutePath, ctx.cwd, ctx);
      ctx.ui.notify(result.message, result.ok ? "info" : "error");

      if (result.extensionHints.length > 0) {
        ctx.ui.notify(result.extensionHints.join("\n"), "warning");
      }

      if (result.ok && result.hasNewSkills) {
        await ctx.reload();
      }
    },
  });

  pi.registerCommand("remove-dir", {
    description: "Remove an external directory from this session",
    getArgumentCompletions(prefix: string) {
      if (addedDirs.length === 0) return null;
      const lower = prefix.toLowerCase();
      return addedDirs
        .filter(d => d.label.toLowerCase().startsWith(lower) || d.absolutePath.toLowerCase().startsWith(lower))
        .map(d => ({ label: d.label, value: d.absolutePath, description: d.absolutePath }));
    },
    handler: async (args, ctx) => {
      if (addedDirs.length === 0) {
        ctx.ui.notify("No external directories added.", "info");
        return;
      }

      let absolutePath: string | undefined;

      if (args?.trim()) {
        // Support both labels and paths
        const input = args.trim();
        const byLabel = addedDirs.find(d => d.label === input);
        absolutePath = byLabel ? byLabel.absolutePath : resolveDir(input, ctx.cwd);
      } else {
        // Interactive: pick from list
        const choices = addedDirs.map(d => `${d.label} — ${d.absolutePath}`);
        const selected = await ctx.ui.select("Remove which directory?", choices);
        if (selected === undefined) return;
        const selectedIdx = choices.indexOf(selected);
        const selectedDir = selectedIdx >= 0 ? addedDirs[selectedIdx] : undefined;
        absolutePath = selectedDir?.absolutePath;
      }

      if (!absolutePath) return;

      const result = removeDir(absolutePath, ctx);
      ctx.ui.notify(result.message, result.ok ? "info" : "error");

      // Auto-reload if skills were present so they get unregistered
      if (result.ok && result.hadSkills) {
        await ctx.reload();
      }
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
        if (dirCtx.skills.size > 0) badges.push(`${dirCtx.skills.size} skill(s)`);
        if (dirCtx.extensionPaths.length > 0) badges.push(`${dirCtx.extensionPaths.length} extension(s)`);

        lines.push(`  📂 ${dir.label}`);
        lines.push(`     ${dir.absolutePath}`);
        if (badges.length > 0) {
          lines.push(`     Found: ${badges.join(", ")}`);
        }
        if (dirCtx.skills.size > 0) {
          const skillNames = [...dirCtx.skills.keys()].map(s => `/skill:${s}`).join(", ");
          lines.push(`     Skills: ${skillNames}`);
        }
        if (dirCtx.extensionPaths.length > 0) {
          lines.push(`     Extensions found — add to settings.json to enable`);
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
      const dirPath = resolveInputPath(params.path.replace(/^@/, ""), ctx.cwd);
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
        response.push("Skills will be registered as /skill:name commands after reload.");
      }
      if (dirCtx.extensionPaths.length > 0) {
        response.push(`\nFound ${dirCtx.extensionPaths.length} extension(s) in .pi/extensions/.`);
        response.push(`To enable: add "${resolveDir(dirPath, ctx.cwd)}/.pi/extensions" to settings.json extensions array, then /reload.`);
      }
      response.push(`\nYou can now access files at: ${resolveDir(dirPath, ctx.cwd)}`);

      // Trigger reload if skills found so they register as /skill:name
      if (dirCtx.skills.size > 0) {
        // Use sendMessage to trigger reload without polluting command autocomplete
        pi.sendMessage(
          { customType: "add-dir:reload", content: [], display: false },
          { triggerTurn: false },
        );
        // Schedule the actual reload via a brief delay to let the tool result render first
        setTimeout(() => {
          pi.sendUserMessage("/reload", { deliverAs: "followUp" });
        }, 100);
        response.push("\nTriggering reload to register skills as /skill:name commands...");
      }

      return {
        content: [{ type: "text", text: response.join("\n") }],
        details: {
          directory: resolveDir(dirPath, ctx.cwd),
          hasAgentsMd: !!dirCtx.agentsMd,
          hasClaudeMd: !!dirCtx.claudeMd,
          skillCount: dirCtx.skills.size,
          skillNames: [...dirCtx.skills.keys()],
          extensionCount: dirCtx.extensionPaths.length,
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
        extensionCount?: number;
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
      if (details.extensionCount && details.extensionCount > 0) {
        badges.push(theme.fg("dim", `${details.extensionCount} ext`));
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

  // -----------------------------------------------------------------------
  // LLM Tool — search files across external directories
  // -----------------------------------------------------------------------

  pi.registerTool({
    name: "search_external_files",
    label: "Search External Files",
    description:
      "Search for files across all external directories added to this session. " +
      "Use this when you need to find files in external directories, since the @ file picker " +
      "only searches the current working directory.",
    promptSnippet: "Search for files across all added external directories by name pattern",
    promptGuidelines: [
      "Use search_external_files when you need to find a file in an external directory but don't know its exact path.",
      "Supports glob-style patterns like '*.ts', '**/*.test.js', 'src/**/*.rb'.",
      "Returns matching file paths with their parent directory labels.",
    ],
    parameters: Type.Object({
      pattern: Type.String({
        description: "File name or glob pattern to search for (e.g., '*.ts', 'config/**', 'README.md')",
      }),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (default: 50)",
        })
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      if (addedDirs.length === 0) {
        throw new Error("No external directories added. Use /add-dir or add_directory first.");
      }

      const maxResults = params.maxResults ?? 50;
      const pattern = params.pattern.replace(/^@/, "");

      // Use find command for each directory
      const results: { dir: string; label: string; files: string[] }[] = [];
      let totalFound = 0;

      for (const dir of addedDirs) {
        if (signal?.aborted) break;
        if (!dirExists(dir.absolutePath)) continue;

        try {
          const remaining = maxResults - totalFound;
          if (remaining <= 0) break;

          // Use spawnSync with array args to avoid shell injection
          const hasSlash = pattern.includes("/");
          const findFlag = hasSlash ? "-path" : "-name";
          const findArgs = [
            dir.absolutePath,
            "-not", "-path", "*/node_modules/*",
            "-not", "-path", "*/.git/*",
            findFlag, pattern,
            "-type", "f",
          ];
          const result = childProcess.spawnSync("find", findArgs, {
            encoding: "utf-8",
            timeout: 10_000,
          });
          const output = (result.stdout ?? "").trim();
          const allFiles = output ? output.split("\n").filter(Boolean) : [];
          const files = allFiles.slice(0, remaining);

          if (files.length > 0) {
            results.push({ dir: dir.absolutePath, label: dir.label, files });
            totalFound += files.length;
          }
        } catch {
          // Skip dirs where find fails
        }
      }

      if (totalFound === 0) {
        return {
          content: [{ type: "text", text: `No files matching "${pattern}" found in ${addedDirs.length} external director${addedDirs.length === 1 ? "y" : "ies"}.` }],
          details: { totalFound: 0, pattern },
        };
      }

      const lines: string[] = [`Found ${totalFound} file(s) matching "${pattern}":\n`];
      for (const r of results) {
        lines.push(`📂 ${r.label} (${r.dir}):`);
        for (const f of r.files) {
          lines.push(`  ${f}`);
        }
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { totalFound, pattern, dirCount: results.length },
      };
    },

    renderCall(args, theme, _context) {
      const pattern = args.pattern?.replace(/^@/, "") ?? "";
      let text = theme.fg("toolTitle", theme.bold("search_external_files "));
      text += theme.fg("accent", `"${pattern}"`);
      text += theme.fg("dim", ` across ${addedDirs.length} dir(s)`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as { totalFound?: number; pattern?: string; dirCount?: number } | undefined;

      if (!details || !details.totalFound) {
        const content = result.content?.[0];
        const text = content && "text" in content ? content.text : "No results";
        return new Text(theme.fg("muted", text), 0, 0);
      }

      let text = theme.fg("success", `✓ ${details.totalFound} file(s)`);
      text += theme.fg("dim", ` matching "${details.pattern}" in ${details.dirCount} dir(s)`);

      if (expanded) {
        const content = result.content?.[0];
        if (content && "text" in content) {
          text += "\n" + theme.fg("muted", content.text);
        }
      }

      return new Text(text, 0, 0);
    },
  });
}
