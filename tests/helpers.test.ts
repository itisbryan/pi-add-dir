import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Re-implement helpers here for unit testing (they're not exported from the
// extension). This also serves as a spec for expected behavior.
// ---------------------------------------------------------------------------

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

function cwdHash(cwd: string): string {
  return crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 12);
}

function getTempStatePath(cwd: string): string {
  return path.join(os.tmpdir(), `pi-add-dir-${cwdHash(cwd)}.json`);
}

interface AddedDir {
  absolutePath: string;
  label: string;
  addedAt: number;
}

function writeTempState(cwd: string, dirs: AddedDir[]): void {
  fs.writeFileSync(getTempStatePath(cwd), JSON.stringify({ dirs }), "utf-8");
}

function readTempState(cwd: string): AddedDir[] {
  try {
    const content = fs.readFileSync(getTempStatePath(cwd), "utf-8");
    const data = JSON.parse(content) as { dirs?: AddedDir[] };
    return data.dirs ?? [];
  } catch {
    return [];
  }
}

const SKILL_DIRS = [".pi/skills", ".agents/skills", ".claude/skills"];

interface DirContext {
  dir: string;
  agentsMd: string | null;
  claudeMd: string | null;
  skills: Map<string, string>;
  skillPaths: Map<string, string>;
  extensionPaths: string[];
}

function scanDirContext(dir: string): DirContext {
  const ctx: DirContext = {
    dir,
    agentsMd: null,
    claudeMd: null,
    skillPaths: new Map(),
    skills: new Map(),
    extensionPaths: [],
  };

  ctx.agentsMd = readFileSafe(path.join(dir, "AGENTS.md"));
  ctx.claudeMd = readFileSafe(path.join(dir, "CLAUDE.md"));

  const piAgents = readFileSafe(path.join(dir, ".pi", "AGENTS.md"));
  if (piAgents) ctx.agentsMd = (ctx.agentsMd ?? "") + "\n\n" + piAgents;

  const piClaude = readFileSafe(path.join(dir, ".pi", "CLAUDE.md"));
  if (piClaude) ctx.claudeMd = (ctx.claudeMd ?? "") + "\n\n" + piClaude;

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
      // skip
    }
  }

  const extDir = path.join(dir, ".pi", "extensions");
  if (dirExists(extDir)) {
    try {
      const entries = fs.readdirSync(extDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".ts")) {
          ctx.extensionPaths.push(path.join(extDir, entry.name));
        } else if (entry.isDirectory()) {
          const indexPath = path.join(extDir, entry.name, "index.ts");
          if (readFileSafe(indexPath) !== null) {
            ctx.extensionPaths.push(indexPath);
          }
        }
      }
    } catch {
      // skip
    }
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-add-dir-test-"));
}

function writeFile(base: string, relPath: string, content: string): void {
  const full = path.join(base, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveDir", () => {
  it("resolves absolute paths as-is", () => {
    const result = resolveDir("/tmp/some-dir", "/other");
    expect(result).toBe("/tmp/some-dir");
  });

  it("resolves relative paths against cwd", () => {
    const result = resolveDir("./sub", "/tmp");
    // /tmp may be a symlink to /private/tmp on macOS; non-existent paths aren't resolved
    expect(result).toMatch(/\/tmp\/sub$/);
  });

  it("resolves .. paths", () => {
    const result = resolveDir("../sibling", "/tmp/project");
    expect(result).toMatch(/sibling$/);
  });
});

describe("dirExists", () => {
  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true for existing directory", () => {
    expect(dirExists(tmpDir)).toBe(true);
  });

  it("returns false for non-existent path", () => {
    expect(dirExists(path.join(tmpDir, "nope"))).toBe(false);
  });

  it("returns false for a file", () => {
    const filePath = path.join(tmpDir, "file.txt");
    fs.writeFileSync(filePath, "hello");
    expect(dirExists(filePath)).toBe(false);
  });
});

describe("readFileSafe", () => {
  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads existing file", () => {
    const filePath = path.join(tmpDir, "test.md");
    fs.writeFileSync(filePath, "hello world");
    expect(readFileSafe(filePath)).toBe("hello world");
  });

  it("returns null for missing file", () => {
    expect(readFileSafe(path.join(tmpDir, "missing.md"))).toBeNull();
  });
});

describe("temp state", () => {
  const testCwd = `/tmp/pi-add-dir-test-${Date.now()}`;

  afterEach(() => {
    try {
      fs.unlinkSync(getTempStatePath(testCwd));
    } catch {
      // ignore
    }
  });

  it("round-trips directory state", () => {
    const dirs: AddedDir[] = [
      { absolutePath: "/a", label: "a", addedAt: 1 },
      { absolutePath: "/b", label: "b", addedAt: 2 },
    ];
    writeTempState(testCwd, dirs);
    const result = readTempState(testCwd);
    expect(result).toEqual(dirs);
  });

  it("returns empty array when no state file exists", () => {
    expect(readTempState("/nonexistent-cwd-" + Date.now())).toEqual([]);
  });

  it("generates deterministic hash for same cwd", () => {
    expect(cwdHash("/my/project")).toBe(cwdHash("/my/project"));
  });

  it("generates different hash for different cwd", () => {
    expect(cwdHash("/a")).not.toBe(cwdHash("/b"));
  });
});

describe("scanDirContext", () => {
  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty context for empty directory", () => {
    const ctx = scanDirContext(tmpDir);
    expect(ctx.agentsMd).toBeNull();
    expect(ctx.claudeMd).toBeNull();
    expect(ctx.skills.size).toBe(0);
    expect(ctx.extensionPaths).toEqual([]);
  });

  it("finds root AGENTS.md", () => {
    writeFile(tmpDir, "AGENTS.md", "# Rules");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.agentsMd).toBe("# Rules");
  });

  it("finds root CLAUDE.md", () => {
    writeFile(tmpDir, "CLAUDE.md", "# Claude rules");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.claudeMd).toBe("# Claude rules");
  });

  it("merges root and .pi/ AGENTS.md", () => {
    writeFile(tmpDir, "AGENTS.md", "root");
    writeFile(tmpDir, ".pi/AGENTS.md", "pi-dir");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.agentsMd).toContain("root");
    expect(ctx.agentsMd).toContain("pi-dir");
  });

  it("finds .pi/ AGENTS.md when no root file", () => {
    writeFile(tmpDir, ".pi/AGENTS.md", "pi-only");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.agentsMd).toContain("pi-only");
  });

  it("discovers skills in .pi/skills/", () => {
    writeFile(tmpDir, ".pi/skills/my-skill/SKILL.md", "# My Skill");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.skills.size).toBe(1);
    expect(ctx.skills.get("my-skill")).toBe("# My Skill");
    expect(ctx.skillPaths.get("my-skill")).toContain("SKILL.md");
  });

  it("discovers skills in .agents/skills/", () => {
    writeFile(tmpDir, ".agents/skills/another/SKILL.md", "# Another");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.skills.get("another")).toBe("# Another");
  });

  it("discovers skills in .claude/skills/", () => {
    writeFile(tmpDir, ".claude/skills/claude-skill/SKILL.md", "# Claude Skill");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.skills.get("claude-skill")).toBe("# Claude Skill");
  });

  it("ignores skill dirs without SKILL.md", () => {
    fs.mkdirSync(path.join(tmpDir, ".pi/skills/empty-skill"), { recursive: true });
    const ctx = scanDirContext(tmpDir);
    expect(ctx.skills.size).toBe(0);
  });

  it("discovers .ts extensions in .pi/extensions/", () => {
    writeFile(tmpDir, ".pi/extensions/my-ext.ts", "export default () => {}");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.extensionPaths.length).toBe(1);
    expect(ctx.extensionPaths[0]).toContain("my-ext.ts");
  });

  it("discovers directory-based extensions with index.ts", () => {
    writeFile(tmpDir, ".pi/extensions/complex-ext/index.ts", "export default () => {}");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.extensionPaths.length).toBe(1);
    expect(ctx.extensionPaths[0]).toContain("index.ts");
  });

  it("ignores extension dirs without index.ts", () => {
    fs.mkdirSync(path.join(tmpDir, ".pi/extensions/no-index"), { recursive: true });
    writeFile(tmpDir, ".pi/extensions/no-index/other.ts", "// not index");
    const ctx = scanDirContext(tmpDir);
    expect(ctx.extensionPaths.length).toBe(0);
  });

  it("handles complex project with everything", () => {
    writeFile(tmpDir, "AGENTS.md", "# Root agents");
    writeFile(tmpDir, "CLAUDE.md", "# Claude");
    writeFile(tmpDir, ".pi/AGENTS.md", "# Pi agents");
    writeFile(tmpDir, ".pi/skills/skill-a/SKILL.md", "# Skill A");
    writeFile(tmpDir, ".agents/skills/skill-b/SKILL.md", "# Skill B");
    writeFile(tmpDir, ".pi/extensions/ext.ts", "export default () => {}");

    const ctx = scanDirContext(tmpDir);
    expect(ctx.agentsMd).toContain("Root agents");
    expect(ctx.agentsMd).toContain("Pi agents");
    expect(ctx.claudeMd).toBe("# Claude");
    expect(ctx.skills.size).toBe(2);
    expect(ctx.extensionPaths.length).toBe(1);
  });
});
