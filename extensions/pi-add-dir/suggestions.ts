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
/** Files that indicate a directory is a real project (ordered by frequency for fast short-circuit) */
const PROJECT_MARKERS = [
  "package.json",     // JS/TS (most common)
  ".git",             // Any git repo
  "Cargo.toml",       // Rust
  "go.mod",           // Go
  "pyproject.toml",   // Python (modern)
  "Gemfile",          // Ruby
  "pom.xml",          // Maven/JVM
  "build.gradle",     // Gradle
  "build.gradle.kts", // Gradle (Kotlin DSL)
  "mix.exs",          // Elixir
  "Makefile",         // C/C++/general
  "CMakeLists.txt",   // CMake
  "setup.py",         // Python (legacy)
  "setup.cfg",        // Python (legacy)
  "deno.json",        // Deno
  "project.json",     // Nx
  "composer.json",    // PHP
  "Package.swift",    // Swift PM
  "pubspec.yaml",     // Dart/Flutter
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
    try {
      fs.statSync(path.join(dir, marker));
      return true;
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

/** Cache for git root lookups — avoids re-walking for every sibling */
const gitRootCache = new Map<string, string | null>();

/** Find the git root by walking up from cwd. Stops after 10 levels. */
function findGitRoot(cwd: string): string | null {
  const cached = gitRootCache.get(cwd);
  if (cached !== undefined) return cached;

  let current = cwd;
  const visited: string[] = [cwd];
  let depth = 0;
  while (depth < 10) {
    depth++;
    if (dirExists(path.join(current, ".git")) || fileExists(path.join(current, ".git"))) {
      // Cache result for all visited paths
      for (const v of visited) gitRootCache.set(v, current);
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // No git root found — cache null for all visited
      for (const v of visited) gitRootCache.set(v, null);
      return null;
    }
    current = parent;
    visited.push(current);
  }
  // Depth limit reached — cache null for visited paths
  for (const v of visited) gitRootCache.set(v, null);
  return null;
}

/** Find the workspace root by walking up looking for workspace config files.
 *  Stops after 10 levels to avoid expensive traversal to / on lone projects. */
function findWorkspaceRoot(cwd: string): string | null {
  let current = cwd;
  let depth = 0;
  const MAX_DEPTH = 10;
  while (depth < MAX_DEPTH) {
    depth++;
    // npm/yarn workspaces (via package.json)
    const pkg = readFileSafe(path.join(current, "package.json"));
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg);
        if (parsed.workspaces) return current;
      } catch { /* skip */ }
    }
    // pnpm workspaces (pnpm-workspace.yaml)
    if (fileExists(path.join(current, "pnpm-workspace.yaml"))) return current;
    // Cargo workspace
    const cargo = readFileSafe(path.join(current, "Cargo.toml"));
    if (cargo && cargo.includes("[workspace]")) return current;
    // Go workspace
    if (fileExists(path.join(current, "go.work"))) return current;
    // Gradle multi-project
    if (fileExists(path.join(current, "settings.gradle")) || fileExists(path.join(current, "settings.gradle.kts"))) return current;
    // Maven multi-module (pom.xml with <modules>)
    const pomXml = readFileSafe(path.join(current, "pom.xml"));
    if (pomXml && pomXml.includes("<modules>")) return current;
    // .NET solution
    try {
      if (fs.readdirSync(current).some(f => f.endsWith(".sln"))) return current;
    } catch { /* skip */ }
    // Python/uv workspace (pyproject.toml with [tool.uv.workspace] members)
    const pyprojectWs = readFileSafe(path.join(current, "pyproject.toml"));
    if (pyprojectWs && pyprojectWs.includes("[tool.uv.workspace]")) return current;
    // Generic Python monorepo (pyproject.toml at a parent level)
    if (pyprojectWs && current !== cwd) return current;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null; // depth limit reached
}

// ---------------------------------------------------------------------------
// Heuristic collectors
// ---------------------------------------------------------------------------

type Candidate = { dir: string; reasons: string[]; weight: number };

/**
 * Collect sibling directories that look like projects.
 * Only suggests siblings that share the same git repo as cwd, OR have
 * context files (AGENTS.md/CLAUDE.md) that make them high-value.
 *
 * When there are many sibling projects (>3), generic ones without strong
 * signals are dropped — a "projects folder" with 10 repos means most are
 * unrelated to the current work.
 */
function collectSiblings(cwd: string): Candidate[] {
  const parent = path.dirname(cwd);
  if (parent === cwd) return []; // at root

  // Determine if cwd is inside a git repo — siblings in the same repo are more relevant
  const cwdGitRoot = findGitRoot(cwd);

  // First pass: categorize all sibling projects
  interface SiblingInfo {
    fullPath: string;
    sameRepo: boolean;
    hasContext: boolean;
  }
  const siblings: SiblingInfo[] = [];

  try {
    const entries = fs.readdirSync(parent, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(parent, entry.name);
      if (fullPath === cwd) continue;
      if (!isProject(fullPath)) continue;

      const siblingGitRoot = findGitRoot(fullPath);
      const sameRepo = !!(cwdGitRoot && siblingGitRoot && cwdGitRoot === siblingGitRoot);
      const hasContext = hasContextFiles(fullPath) || hasSkills(fullPath);

      siblings.push({ fullPath, sameRepo, hasContext });
    }
  } catch { /* skip */ }

  // When there are many unrelated siblings, only suggest those with strong signals
  const totalSiblings = siblings.length;
  const candidates: Candidate[] = [];

  for (const sib of siblings) {
    if (sib.sameRepo) {
      candidates.push({
        dir: sib.fullPath,
        reasons: ["sibling project (same repo)"],
        weight: 0.35,
      });
    } else if (sib.hasContext) {
      candidates.push({
        dir: sib.fullPath,
        reasons: ["sibling project (has context files)"],
        weight: 0.25,
      });
    } else if (totalSiblings <= 3) {
      // Few siblings — they're probably closely related, include them
      candidates.push({
        dir: sib.fullPath,
        reasons: ["sibling project"],
        weight: 0.2,
      });
    }
    // When >3 siblings and no strong signal: skip (too many unrelated projects)
  }

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
      // file:, link:, portal: protocol deps (npm file:, yarn link:/portal:)
      for (const protocol of ["file:", "link:", "portal:"]) {
        if (version.startsWith(protocol)) {
          const relPath = version.slice(protocol.length);
          const resolved = resolvePath(cwd, relPath);
          if (dirExists(resolved)) {
            candidates.push({
              dir: resolved,
              reasons: [`${protocol} dependency (${name})`],
              weight: 0.6,
            });
          }
          break;
        }
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
 * Collect Composer path repository references.
 */
function collectComposerPaths(cwd: string): Candidate[] {
  const composer = readFileSafe(path.join(cwd, "composer.json"));
  if (!composer) return [];

  const candidates: Candidate[] = [];
  try {
    const parsed = JSON.parse(composer);
    const repos = parsed.repositories;
    if (Array.isArray(repos)) {
      for (const repo of repos) {
        if (repo?.type === "path" && typeof repo.url === "string") {
          // Composer path repos can use glob patterns like ../packages/*
          const urlPath = repo.url;
          if (urlPath.endsWith("/*")) {
            const baseDir = resolvePath(cwd, urlPath.slice(0, -2));
            if (dirExists(baseDir)) {
              try {
                const entries = fs.readdirSync(baseDir, { withFileTypes: true });
                for (const entry of entries) {
                  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
                  const fullPath = path.join(baseDir, entry.name);
                  if (isProject(fullPath)) {
                    candidates.push({
                      dir: fullPath,
                      reasons: ["Composer path repository"],
                      weight: 0.6,
                    });
                  }
                }
              } catch { /* skip */ }
            }
          } else {
            const resolved = resolvePath(cwd, urlPath);
            if (dirExists(resolved)) {
              candidates.push({
                dir: resolved,
                reasons: ["Composer path repository"],
                weight: 0.6,
              });
            }
          }
        }
      }
    }
  } catch { /* skip */ }
  return candidates;
}

/**
 * Collect Swift Package Manager local package dependencies.
 */
function collectSwiftPMPaths(cwd: string): Candidate[] {
  const packageSwift = readFileSafe(path.join(cwd, "Package.swift"));
  if (!packageSwift) return [];

  const candidates: Candidate[] = [];
  // Match: .package(path: "../some-package")
  const pathRegex = /\.package\s*\(\s*(?:name:\s*"[^"]*"\s*,\s*)?path:\s*"([^"]+)"/g;
  let match;
  while ((match = pathRegex.exec(packageSwift)) !== null) {
    const relPath = match[1];
    const resolved = resolvePath(cwd, relPath);
    if (dirExists(resolved)) {
      candidates.push({
        dir: resolved,
        reasons: ["Swift PM local package"],
        weight: 0.6,
      });
    }
  }
  return candidates;
}

/**
 * Collect Dart/Flutter pubspec.yaml path dependencies.
 */
function collectPubspecPaths(cwd: string): Candidate[] {
  const pubspec = readFileSafe(path.join(cwd, "pubspec.yaml"));
  if (!pubspec) return [];

  const candidates: Candidate[] = [];
  // Match: path: ../some/package (under dependency_overrides or dependencies)
  const pathRegex = /path:\s*['"]?(\.\.\/[^'"\s]+|\.\/.+)['"]?/g;
  let match;
  while ((match = pathRegex.exec(pubspec)) !== null) {
    const relPath = match[1];
    const resolved = resolvePath(cwd, relPath);
    if (dirExists(resolved)) {
      candidates.push({
        dir: resolved,
        reasons: ["pubspec.yaml path dependency"],
        weight: 0.6,
      });
    }
  }
  return candidates;
}

/**
 * Collect tsconfig.json project references (composite projects).
 */
function collectTsProjectRefs(cwd: string): Candidate[] {
  const tsconfig = readFileSafe(path.join(cwd, "tsconfig.json"));
  if (!tsconfig) return [];

  const candidates: Candidate[] = [];
  // Match: { "path": "../some-package" } in references array
  // Use simple regex since tsconfig may have comments (not valid JSON)
  const refRegex = /"path"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = refRegex.exec(tsconfig)) !== null) {
    const relPath = match[1];
    const resolved = resolvePath(cwd, relPath);
    if (dirExists(resolved)) {
      candidates.push({
        dir: resolved,
        reasons: ["TypeScript project reference"],
        weight: 0.55,
      });
    }
  }
  return candidates;
}

/**
 * Collect Docker Compose build context paths.
 */
function collectDockerComposePaths(cwd: string): Candidate[] {
  const composeNames = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
  let composeContent: string | null = null;

  for (const name of composeNames) {
    composeContent = readFileSafe(path.join(cwd, name));
    if (composeContent) break;
  }
  if (!composeContent) return [];

  const candidates: Candidate[] = [];
  // Match build context paths: build: ./path or build: { context: ./path }
  // Simple pattern: lines with "context:" or "build:" followed by a relative path
  const contextRegex = /(?:context|build):\s*['"]?(\.\.\/[^'"\s]+|\.\/[^'"\s]+)['"]?/g;
  let match;
  while ((match = contextRegex.exec(composeContent)) !== null) {
    const relPath = match[1];
    const resolved = resolvePath(cwd, relPath);
    if (dirExists(resolved) && resolved !== resolvePath(cwd, ".")) {
      candidates.push({
        dir: resolved,
        reasons: ["Docker Compose service"],
        weight: 0.5,
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

  // --- pnpm workspaces (pnpm-workspace.yaml) ---
  const pnpmWs = readFileSafe(path.join(wsRoot, "pnpm-workspace.yaml"));
  if (pnpmWs) {
    // Parse YAML-like patterns: lines starting with "- " under "packages:"
    // Format:
    //   packages:
    //     - 'packages/*'
    //     - 'apps/*'
    const packageLines = pnpmWs.match(/packages:\s*\n((?:\s+-\s*.+\n?)*)/)?.[1] ?? "";
    const patterns = [...packageLines.matchAll(/^\s*-\s*['"]?([^'"\s]+)['"]?/gm)]
      .map(m => m[1]);

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
              if (isProject(fullPath)) {
                candidates.push({
                  dir: fullPath,
                  reasons: ["pnpm workspace member"],
                  weight: 0.5,
                });
              }
            }
          } catch { /* skip */ }
        }
      } else {
        const fullPath = resolvePath(wsRoot, pattern);
        if (fullPath !== cwd && dirExists(fullPath) && isProject(fullPath)) {
          candidates.push({
            dir: fullPath,
            reasons: ["pnpm workspace member"],
            weight: 0.5,
          });
        }
      }
    }
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

  // --- Gradle multi-project (settings.gradle / settings.gradle.kts) ---
  const gradleNames = ["settings.gradle", "settings.gradle.kts"];
  for (const gName of gradleNames) {
    const gradleSettings = readFileSafe(path.join(wsRoot, gName));
    if (!gradleSettings) continue;
    // Match: include(':app', ':lib:core') or include(":app", ":lib:core")
    // Gradle uses colon-separated module paths that map to directory paths
    const includeRegex = /include\s*\(?\s*([^)\n]+)/g;
    let gMatch;
    while ((gMatch = includeRegex.exec(gradleSettings)) !== null) {
      const args = gMatch[1];
      // Extract quoted strings: ':app', ':lib:core', "app"
      const moduleRegex = /['"][:.]?([^'"]+)['"]/g;
      let mMatch;
      while ((mMatch = moduleRegex.exec(args)) !== null) {
        // Convert Gradle module path (:lib:core) to filesystem path (lib/core)
        const modulePath = mMatch[1].replace(/^:/, "").replace(/:/g, "/");
        const fullPath = resolvePath(wsRoot, modulePath);
        if (fullPath !== cwd && dirExists(fullPath)) {
          candidates.push({
            dir: fullPath,
            reasons: ["Gradle project module"],
            weight: 0.5,
          });
        }
      }
    }
    break; // Only process one settings file
  }

  // --- Maven multi-module (pom.xml) ---
  const pom = readFileSafe(path.join(wsRoot, "pom.xml"));
  if (pom) {
    // Match <module>subdir</module> inside <modules> block
    const modulesMatch = pom.match(/<modules>([\s\S]*?)<\/modules>/);
    if (modulesMatch) {
      const moduleRegex = /<module>([^<]+)<\/module>/g;
      let mMatch;
      while ((mMatch = moduleRegex.exec(modulesMatch[1])) !== null) {
        const modulePath = mMatch[1].trim();
        const fullPath = resolvePath(wsRoot, modulePath);
        if (fullPath !== cwd && dirExists(fullPath)) {
          candidates.push({
            dir: fullPath,
            reasons: ["Maven module"],
            weight: 0.5,
          });
        }
      }
    }
  }

  // --- .NET solution (.sln) ---
  try {
    const slnFiles = fs.readdirSync(wsRoot).filter(f => f.endsWith(".sln"));
    for (const slnFile of slnFiles.slice(0, 1)) { // Only first .sln
      const slnContent = readFileSafe(path.join(wsRoot, slnFile));
      if (!slnContent) continue;
      // Match: Project("{...}") = "Name", "path\to\project.csproj", "{...}"
      const projRegex = /Project\([^)]+\)\s*=\s*"[^"]+"\s*,\s*"([^"]+)"/g;
      let slnMatch;
      while ((slnMatch = projRegex.exec(slnContent)) !== null) {
        const projPath = slnMatch[1].replace(/\\/g, "/"); // Convert Windows paths
        // Get the directory containing the .csproj/.fsproj
        const projDir = path.dirname(projPath);
        if (!projDir || projDir === ".") continue;
        const fullPath = resolvePath(wsRoot, projDir);
        if (fullPath !== cwd && dirExists(fullPath)) {
          candidates.push({
            dir: fullPath,
            reasons: [".NET solution project"],
            weight: 0.5,
          });
        }
      }
    }
  } catch { /* skip */ }

  // --- uv/Python workspace (pyproject.toml with [tool.uv.workspace] members) ---
  const pyprojectRoot = readFileSafe(path.join(wsRoot, "pyproject.toml"));
  if (pyprojectRoot && pyprojectRoot.includes("[tool.uv.workspace]")) {
    // Match members = ["packages/*", "apps/*"] in TOML
    const membersMatch = pyprojectRoot.match(/\[tool\.uv\.workspace\][\s\S]*?members\s*=\s*\[([^\]]+)\]/);
    if (membersMatch) {
      const patterns = [...membersMatch[1].matchAll(/["']([^"']+)["']/g)].map(m => m[1]);
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
                if (isProject(fullPath)) {
                  candidates.push({
                    dir: fullPath,
                    reasons: ["uv workspace member"],
                    weight: 0.5,
                  });
                }
              }
            } catch { /* skip */ }
          }
        } else {
          const fullPath = resolvePath(wsRoot, pattern);
          if (fullPath !== cwd && dirExists(fullPath) && isProject(fullPath)) {
            candidates.push({
              dir: fullPath,
              reasons: ["uv workspace member"],
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

function scoreCandidates(candidates: Candidate[], _cwd: string): Suggestion[] {
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

  // Clear git root cache per call (paths may change between calls)
  gitRootCache.clear();

  // Collect candidates from all heuristics
  const candidates: Candidate[] = [
    ...collectSiblings(cwd),
    ...collectNpmFileDeps(cwd),
    ...collectTsProjectRefs(cwd),
    ...collectComposerPaths(cwd),
    ...collectPubspecPaths(cwd),
    ...collectSwiftPMPaths(cwd),
    ...collectGemfilePaths(cwd),
    ...collectCargoPaths(cwd),
    ...collectPythonPaths(cwd),
    ...collectDockerComposePaths(cwd),
    ...collectSubmodules(cwd),
    ...collectWorkspaceMembers(cwd),
  ];

  // Score and deduplicate
  const scored = scoreCandidates(candidates, cwd);

  // Filter out already-added dirs, cwd itself, ancestors of cwd, and low-scoring noise
  const resolvedCwd = resolvePath(cwd, ".");
  const excluded = new Set([resolvedCwd, ...alreadyAdded]);
  const MIN_SCORE = 0.15;

  return scored
    .filter(s => {
      if (excluded.has(s.absolutePath)) return false;
      if (s.score < MIN_SCORE) return false;
      // Exclude dirs that are ancestors of cwd (we're already inside them)
      if (resolvedCwd.startsWith(s.absolutePath + path.sep)) return false;
      return true;
    })
    .slice(0, maxResults);
}
