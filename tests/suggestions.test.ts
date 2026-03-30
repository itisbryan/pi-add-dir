import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { suggestDirectories } from "../extensions/pi-add-dir/suggestions.js";

let fixtureBase: string;

beforeAll(() => {
  let tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-suggest-test-"));
  // Resolve symlinks (macOS /var → /private/var) to match realpathSync in suggestions.ts
  tmpBase = fs.realpathSync(tmpBase);
  execSync(`bash ${path.join(import.meta.dirname, "fixtures", "setup-fixtures.sh")} ${tmpBase}`, {
    stdio: "pipe",
  });
  fixtureBase = path.join(tmpBase, "test-projects");
});

afterAll(() => {
  fs.rmSync(path.dirname(fixtureBase), { recursive: true, force: true });
});

function cwd(rel: string): string {
  // Resolve symlinks to match what the suggestion engine returns (it uses realpathSync)
  try {
    return fs.realpathSync(path.join(fixtureBase, rel));
  } catch {
    return path.join(fixtureBase, rel);
  }
}

describe("suggestDirectories", () => {
  it("returns empty for non-existent cwd", () => {
    const result = suggestDirectories({ cwd: "/nonexistent/path/xyz" });
    expect(result).toEqual([]);
  });

  it("finds workspace members from monorepo", () => {
    const result = suggestDirectories({ cwd: cwd("monorepo/apps/web") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("monorepo/packages/ui"));
    expect(paths).toContain(cwd("monorepo/packages/shared"));
    expect(paths).toContain(cwd("monorepo/apps/api"));
  });

  it("finds sibling projects with <= 3 siblings", () => {
    const result = suggestDirectories({ cwd: cwd("projects/frontend") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("projects/shared-lib"));
    expect(paths).toContain(cwd("projects/backend"));
    // random-notes has no project markers
    expect(paths).not.toContain(cwd("projects/random-notes"));
  });

  it("finds git submodules", () => {
    const result = suggestDirectories({ cwd: cwd("with-submodules") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("with-submodules/vendor/lib-a"));
    expect(paths).toContain(cwd("with-submodules/vendor/lib-b"));
  });

  it("finds Gemfile path dependencies", () => {
    const result = suggestDirectories({ cwd: cwd("rails-app") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("rails-app/engines/auth"));
    expect(paths).toContain(cwd("gems/shared-gem"));
  });

  it("finds Cargo path dependencies", () => {
    const result = suggestDirectories({ cwd: cwd("rust-workspace/crates/app") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("rust-workspace/crates/core"));
    expect(paths).toContain(cwd("rust-workspace/crates/utils"));
  });

  it("finds Go workspace members", () => {
    const result = suggestDirectories({ cwd: cwd("go-workspace/cmd/server") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("go-workspace/pkg/auth"));
    expect(paths).toContain(cwd("go-workspace/internal/db"));
  });

  it("returns nothing for lone project", () => {
    const result = suggestDirectories({ cwd: cwd("lone-project") });
    expect(result).toEqual([]);
  });

  it("excludes already-added dirs", () => {
    const added = [cwd("monorepo/packages/ui")];
    const result = suggestDirectories({ cwd: cwd("monorepo/apps/web"), alreadyAdded: added });
    const paths = result.map(s => s.absolutePath);
    expect(paths).not.toContain(cwd("monorepo/packages/ui"));
    expect(paths).toContain(cwd("monorepo/packages/shared"));
  });

  it("respects maxResults", () => {
    const result = suggestDirectories({ cwd: cwd("monorepo/apps/web"), maxResults: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("assigns higher scores to dirs with context files", () => {
    const result = suggestDirectories({ cwd: cwd("monorepo/apps/web") });
    const ui = result.find(s => s.absolutePath === cwd("monorepo/packages/ui"));
    const api = result.find(s => s.absolutePath === cwd("monorepo/apps/api"));
    // ui has AGENTS.md + skills, api doesn't
    expect(ui).toBeDefined();
    expect(api).toBeDefined();
    expect(ui!.score).toBeGreaterThan(api!.score);
  });

  it("includes reasons for each suggestion", () => {
    const result = suggestDirectories({ cwd: cwd("cross-ref/packages/api") });
    const db = result.find(s => s.absolutePath === cwd("cross-ref/packages/db"));
    expect(db).toBeDefined();
    expect(db!.reasons.length).toBeGreaterThan(0);
  });

  it("deduplicates dirs found by multiple heuristics", () => {
    // cross-ref/packages/db is found via both workspace member AND file: dependency
    const result = suggestDirectories({ cwd: cwd("cross-ref/packages/api") });
    const dbPaths = result.filter(s => s.absolutePath === cwd("cross-ref/packages/db"));
    expect(dbPaths.length).toBe(1); // deduplicated
    // Should have merged reasons
    expect(dbPaths[0].reasons.length).toBeGreaterThanOrEqual(2);
  });
});
