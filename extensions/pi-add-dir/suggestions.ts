/**
 * Directory suggestion engine for pi-add-dir.
 *
 * Scans the project environment and recommends directories that would be
 * useful to add to the session. Uses multiple heuristics:
 *
 * 1. Sibling projects — directories alongside cwd that look like real projects
 * 2. Local dependency paths — file: deps in package.json, path: in Gemfile, etc.
 * 3. Git submodules — paths from .gitmodules
 * 4. Monorepo packages — workspace members (npm, Cargo, Go)
 * 5. Directories with AGENTS.md / CLAUDE.md / skills — high-value for this extension
 *
 * Each suggestion gets a relevance score (0–1) based on how many signals match.
 * Results are deduplicated, sorted by score, and capped.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Suggestion {
  /** Absolute path to the suggested directory */
  absolutePath: string;
  /** Display label (basename) */
  label: string;
  /** Relevance score 0–1 (higher = more relevant) */
  score: number;
  /** Why this directory was suggested */
  reasons: string[];
}

export interface SuggestOptions {
  /** Current working directory */
  cwd: string;
  /** Directories already added (to exclude) */
  alreadyAdded?: string[];
  /** Maximum suggestions to return */
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Files that indicate a directory is a real project */
const PROJECT_MARKERS = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "Gemfile",
  "build.gradle",
  "pom.xml",
  "mix.exs",
  "Makefile",
  "CMakeLists.txt",
  "setup.py",
  "setup.cfg",
  ".git",
];

/** Files/dirs that make a directory extra valuable for pi-add-dir */
const CONTEXT_MARKERS = [
  "AGENTS.md",
  "CLAUDE.md",
  ".pi/AGENTS.md",
  ".pi/CLAUDE.md",
];

const SKILL_DIRS = [".pi/skills", ".agents/skills", ".claude/skills"];
const EXTENSION_DIR = ".pi/extensions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dirExists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
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

function isProject(dir: string): boolean {
  return PROJECT_MARKERS.some(marker => {
    const full = path.join(dir, marker);
    try {
      return fs.statSync(full).isFile() || fs.statSync(full).isDirectory();
    } catch {
      return false;
    }
  });
}

function hasContextFiles(dir: string): boolean {
  return CONTEXT_MARKERS.some(marker => fileExists(path.join(dir, marker)));
}

function hasSkills(dir: string): boolean {
  return SKILL_DIRS.some(skillDir => {
    const full = path.join(dir, skillDir);
    if (!dirExists(full)) return false;
    try {
      const entries = fs.readdirSync(full, { withFileTypes: true });
      return entries.some(e => e.isDirectory() && fileExists(path.join(full, e.name, "SKILL.md")));
    } catch {
      return false;
    }
  });
}

function hasExtensions(dir: string): boolean {
  const full = path.join(dir, EXTENSION_DIR);
  if (!dirExists(full)) return false;
  try {
    const entries = fs.readdirSync(full, { withFileTypes: true });
    return entries.some(e =>
      (e.isFile() && e.name.endsWith(".ts")) ||
      (e.isDirectory() && fileExists(path.join(full, e.name, "index.ts")))
    );
  } catch {
    return false;
  }
}

/** Resolve a potentially relative path from a base directory */
function resolvePath(base: string, rel: string): string {
  const resolved = path.isAbsolute(rel) ? rel : path.resolve(base, rel);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return path.resolve(resolved);
  }
}

/** Find the git root by walking up from cwd */
function findGitRoot(cwd: string): string | null {
  let current = cwd;
  while (true) {
    if (dirExists(path.join(current, ".git")) || fileExists(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Find the workspace root by walking up looking for workspace config files */
function findWorkspaceRoot(cwd: string): string | null {
  let current = cwd;
  while (true) {
    // npm/yarn/pnpm workspaces
    const pkg = readFileSafe(path.join(current, "package.json"));
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg);
        if (parsed.workspaces) return current;
      } catch { /* skip */ }
    }
    // Cargo workspace
    const cargo = readFileSafe(path.join(current, "Cargo.toml"));
    if (cargo && cargo.includes("[workspace]")) return current;
    // Go workspace
    if (fileExists(path.join(current, "go.work"))) return current;
    // Python monorepo (pyproject.toml at root with multiple sub-projects)
    if (fileExists(path.join(current, "pyproject.toml")) && current !== cwd) {
      // Check if it's a parent that has sub-projects
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// ---------------------------------------------------------------------------
// Heuristic collectors
// ---------------------------------------------------------------------------

type Candidate = { dir: string; reasons: string[]; weight: number };

/**
 * Collect sibling directories that look like projects.
 */
function collectSiblings(cwd: string): Candidate[] {
  const parent = path.dirname(cwd);
  if (parent === cwd) return []; // at root

  const candidates: Candidate[] = [];
  try {
    const entries = fs.readdirSync(parent, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(parent, entry.name);
      if (fullPath === cwd) continue;

      if (isProject(fullPath)) {
        candidates.push({
          dir: fullPath,
          reasons: ["sibling project"],
          weight: 0.3,
        });
      }
    }
  } catch { /* skip */ }
  return candidates;
}

/**
 * Collect local file: dependencies from package.json.
 */
function collectNpmFileDeps(cwd: string): Candidate[] {
  const pkg = readFileSafe(path.join(cwd, "package.json"));
  if (!pkg) return [];

  const candidates: Candidate[] = [];
  try {
    const parsed = JSON.parse(pkg);
    const allDeps = {
      ...parsed.dependencies,
      ...parsed.devDependencies,
    };
    for (const [name, version] of Object.entries(allDeps)) {
      if (typeof version !== "string") continue;
      // file: protocol deps
      if (version.startsWith("file:")) {
        const relPath = version.slice(5);
        const resolved = resolvePath(cwd, relPath);
        if (dirExists(resolved)) {
          candidates.push({
            dir: resolved,
            reasons: [`npm file: dependency (${name})`],
            weight: 0.6,
          });
        }
      }
      // workspace: protocol — resolve from workspace root
      if (version.startsWith("workspace:")) {
        // These are resolved via monorepo heuristic, skip here
      }
    }
  } catch { /* skip */ }
  return candidates;
}

/**
 * Collect path: gems from Gemfile.
 */
function collectGemfilePaths(cwd: string): Candidate[] {
  const gemfile = readFileSafe(path.join(cwd, "Gemfile"));
  if (!gemfile) return [];

  const candidates: Candidate[] = [];
  // Match: gem 'name', path: 'some/path'  or  gem "name", path: "some/path"
  const pathRegex = /gem\s+['"]([^'"]+)['"]\s*,\s*path:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = pathRegex.exec(gemfile)) !== null) {
    const gemName = match[1];
    const relPath = match[2];
    const resolved = resolvePath(cwd, relPath);
    if (dirExists(resolved)) {
      candidates.push({
        dir: resolved,
        reasons: [`Gemfile path dependency (${gemName})`],
        weight: 0.6,
      });
    }
  }
  return candidates;
}

/**
 * Collect Cargo.toml path dependencies.
 */
function collectCargoPaths(cwd: string): Candidate[] {
  const cargo = readFileSafe(path.join(cwd, "Cargo.toml"));
  if (!cargo) return [];

  const candidates: Candidate[] = [];
  // Match: path = "../something"
  const pathRegex = /path\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = pathRegex.exec(cargo)) !== null) {
    const relPath = match[1];
    const resolved = resolvePath(cwd, relPath);
    if (dirExists(resolved)) {
      candidates.push({
        dir: resolved,
        reasons: ["Cargo path dependency"],
        weight: 0.6,
      });
    }
  }
  return candidates;
}

/**
 * Collect Python local file dependencies from pyproject.toml.
 */
function collectPythonPaths(cwd: string): Candidate[] {
  const pyproject = readFileSafe(path.join(cwd, "pyproject.toml"));
  if (!pyproject) return [];

  const candidates: Candidate[] = [];
  // Match: something @ file:../../some/path
  const fileRegex = /file:([^\s"',\]]+)/g;
  let match;
  while ((match = fileRegex.exec(pyproject)) !== null) {
    const relPath = match[1];
    const resolved = resolvePath(cwd, relPath);
    if (dirExists(resolved)) {
      candidates.push({
        dir: resolved,
        reasons: ["Python file dependency"],
        weight: 0.6,
      });
    }
  }
  return candidates;
}

/**
 * Collect git submodule paths from .gitmodules.
 */
function collectSubmodules(cwd: string): Candidate[] {
  // Look for .gitmodules in cwd or git root
  const gitRoot = findGitRoot(cwd);
  const searchDirs = gitRoot && gitRoot !== cwd ? [cwd, gitRoot] : [cwd];

  const candidates: Candidate[] = [];
  for (const searchDir of searchDirs) {
    const gitmodules = readFileSafe(path.join(searchDir, ".gitmodules"));
    if (!gitmodules) continue;

    // Match: path = vendor/lib-a
    const pathRegex = /path\s*=\s*(.+)/g;
    let match;
    while ((match = pathRegex.exec(gitmodules)) !== null) {
      const relPath = match[1].trim();
      const resolved = resolvePath(searchDir, relPath);
      if (dirExists(resolved)) {
        candidates.push({
          dir: resolved,
          reasons: ["git submodule"],
          weight: 0.5,
        });
      }
    }
  }
  return candidates;
}

/**
 * Collect monorepo workspace members.
 * Supports: npm workspaces, Cargo workspace, Go workspace.
 */
function collectWorkspaceMembers(cwd: string): Candidate[] {
  const wsRoot = findWorkspaceRoot(cwd);
  if (!wsRoot) return [];

  const candidates: Candidate[] = [];

  // --- npm workspaces ---
  const pkg = readFileSafe(path.join(wsRoot, "package.json"));
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      const workspaces: string[] = Array.isArray(parsed.workspaces)
        ? parsed.workspaces
        : parsed.workspaces?.packages ?? [];

      for (const pattern of workspaces) {
        // Expand simple glob patterns like "packages/*"
        if (pattern.endsWith("/*")) {
          const baseDir = path.join(wsRoot, pattern.slice(0, -2));
          if (dirExists(baseDir)) {
            try {
              const entries = fs.readdirSync(baseDir, { withFileTypes: true });
              for (const entry of entries) {
                if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
                const fullPath = path.join(baseDir, entry.name);
                if (fullPath === cwd) continue;
                if (isProject(fullPath)) {
                  candidates.push({
                    dir: fullPath,
                    reasons: ["workspace member"],
                    weight: 0.5,
                  });
                }
              }
            } catch { /* skip */ }
          }
        } else {
          // Direct path
          const fullPath = resolvePath(wsRoot, pattern);
          if (fullPath !== cwd && dirExists(fullPath) && isProject(fullPath)) {
            candidates.push({
              dir: fullPath,
              reasons: ["workspace member"],
              weight: 0.5,
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  // --- Cargo workspace ---
  const cargo = readFileSafe(path.join(wsRoot, "Cargo.toml"));
  if (cargo && cargo.includes("[workspace]")) {
    // Match members = ["crates/*"]
    const membersMatch = cargo.match(/members\s*=\s*\[([\s\S]*?)\]/);
    if (membersMatch) {
      const membersStr = membersMatch[1];
      const patterns = membersStr.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, "")) ?? [];
      for (const pattern of patterns) {
        if (pattern.endsWith("/*")) {
          const baseDir = path.join(wsRoot, pattern.slice(0, -2));
          if (dirExists(baseDir)) {
            try {
              const entries = fs.readdirSync(baseDir, { withFileTypes: true });
              for (const entry of entries) {
                if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
                const fullPath = path.join(baseDir, entry.name);
                if (fullPath === cwd) continue;
                candidates.push({
                  dir: fullPath,
                  reasons: ["Cargo workspace member"],
                  weight: 0.5,
                });
              }
            } catch { /* skip */ }
          }
        } else {
          const fullPath = resolvePath(wsRoot, pattern);
          if (fullPath !== cwd && dirExists(fullPath)) {
            candidates.push({
              dir: fullPath,
              reasons: ["Cargo workspace member"],
              weight: 0.5,
            });
          }
        }
      }
    }
  }

  // --- Go workspace ---
  const gowork = readFileSafe(path.join(wsRoot, "go.work"));
  if (gowork) {
    // Match "use" block: use ( ./cmd/server ./pkg/auth )
    const useMatch = gowork.match(/use\s*\(([\s\S]*?)\)/);
    if (useMatch) {
      const paths = useMatch[1].trim().split(/\s+/).filter(Boolean);
      for (const p of paths) {
        const fullPath = resolvePath(wsRoot, p);
        if (fullPath !== cwd && dirExists(fullPath)) {
          candidates.push({
            dir: fullPath,
            reasons: ["Go workspace member"],
            weight: 0.5,
          });
        }
      }
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreCandidates(candidates: Candidate[], cwd: string): Suggestion[] {
  // Deduplicate by absolute path, merging reasons and weights
  const byPath = new Map<string, { reasons: string[]; totalWeight: number }>();

  for (const c of candidates) {
    const existing = byPath.get(c.dir);
    if (existing) {
      existing.reasons.push(...c.reasons);
      existing.totalWeight += c.weight;
    } else {
      byPath.set(c.dir, { reasons: [...c.reasons], totalWeight: c.weight });
    }
  }

  const suggestions: Suggestion[] = [];

  for (const [dir, data] of byPath) {
    let score = Math.min(data.totalWeight, 1.0);

    // Bonus for having AGENTS.md / CLAUDE.md (high value for pi-add-dir)
    if (hasContextFiles(dir)) {
      score = Math.min(score + 0.25, 1.0);
      data.reasons.push("has AGENTS.md/CLAUDE.md");
    }

    // Bonus for having skills
    if (hasSkills(dir)) {
      score = Math.min(score + 0.15, 1.0);
      data.reasons.push("has skills");
    }

    // Bonus for having extensions
    if (hasExtensions(dir)) {
      score = Math.min(score + 0.1, 1.0);
      data.reasons.push("has .pi/extensions");
    }

    // Deduplicate reasons
    const uniqueReasons = [...new Set(data.reasons)];

    suggestions.push({
      absolutePath: dir,
      label: path.basename(dir),
      score: Math.round(score * 100) / 100,
      reasons: uniqueReasons,
    });
  }

  // Sort by score descending, then alphabetically
  suggestions.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return suggestions;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function suggestDirectories(options: SuggestOptions): Suggestion[] {
  const { cwd, alreadyAdded = [], maxResults = 10 } = options;

  if (!dirExists(cwd)) return [];

  // Collect candidates from all heuristics
  const candidates: Candidate[] = [
    ...collectSiblings(cwd),
    ...collectNpmFileDeps(cwd),
    ...collectGemfilePaths(cwd),
    ...collectCargoPaths(cwd),
    ...collectPythonPaths(cwd),
    ...collectSubmodules(cwd),
    ...collectWorkspaceMembers(cwd),
  ];

  // Score and deduplicate
  const scored = scoreCandidates(candidates, cwd);

  // Filter out already-added dirs and cwd
  const resolvedCwd = resolvePath(cwd, ".");
  const excluded = new Set([resolvedCwd, ...alreadyAdded]);

  return scored
    .filter(s => !excluded.has(s.absolutePath))
    .slice(0, maxResults);
}
