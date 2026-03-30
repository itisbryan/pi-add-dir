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
}, 30_000); // fixture setup creates 24+ scenarios with git init

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

  it("finds Docker Compose build context paths", () => {
    const result = suggestDirectories({ cwd: cwd("docker-micro/gateway") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("docker-micro/auth-service"));
    expect(paths).toContain(cwd("docker-micro/user-service"));
  });

  it("finds pnpm workspace members", () => {
    const result = suggestDirectories({ cwd: cwd("pnpm-mono/apps/web") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("pnpm-mono/packages/ui"));
    expect(paths).toContain(cwd("pnpm-mono/packages/utils"));
    expect(paths).toContain(cwd("pnpm-mono/apps/admin"));
  });

  it("finds Gradle project modules", () => {
    const result = suggestDirectories({ cwd: cwd("android-app/app") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("android-app/lib/core"));
    expect(paths).toContain(cwd("android-app/lib/network"));
  });

  it("excludes ancestor dirs when deeply nested", () => {
    const result = suggestDirectories({ cwd: cwd("deep/monorepo/packages/ui/src/components") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("deep/monorepo/packages/shared"));
    expect(paths).not.toContain(cwd("deep/monorepo/packages/ui"));
  });

  it("finds .NET solution project references", () => {
    const result = suggestDirectories({ cwd: cwd("dotnet-sln/src/WebApi") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("dotnet-sln/src/Core"));
    expect(paths).toContain(cwd("dotnet-sln/src/Infrastructure"));
  });

  it("finds PHP Composer path repositories", () => {
    const result = suggestDirectories({ cwd: cwd("php-mono/app") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("php-mono/packages/auth"));
    expect(paths).toContain(cwd("php-mono/packages/mailer"));
  });

  it("finds uv Python workspace members", () => {
    const result = suggestDirectories({ cwd: cwd("uv-workspace/packages/api") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("uv-workspace/packages/core"));
    expect(paths).toContain(cwd("uv-workspace/libs/shared"));
  });

  it("finds Yarn Berry link: and portal: deps", () => {
    const result = suggestDirectories({ cwd: cwd("yarn-berry/app") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("yarn-berry/shared"));
    expect(paths).toContain(cwd("yarn-berry/utils"));
  });

  it("finds Flutter pubspec.yaml path deps", () => {
    const result = suggestDirectories({ cwd: cwd("flutter-mono/apps/mobile") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("flutter-mono/packages/core"));
    expect(paths).toContain(cwd("flutter-mono/packages/ui"));
  });

  it("resolves symlinked dependencies to real paths", () => {
    const result = suggestDirectories({ cwd: cwd("symlink-test/app") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("symlink-test/real-lib"));
  });

  it("handles nested workspaces (inner takes priority)", () => {
    const result = suggestDirectories({ cwd: cwd("nested-ws/packages/sub-mono/apps/dashboard") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("nested-ws/packages/sub-mono/libs/common"));
    // Outer workspace member should NOT appear
    expect(paths).not.toContain(cwd("nested-ws/packages/other-pkg"));
  });

  it("precision: filters generic siblings when many exist", () => {
    const result = suggestDirectories({ cwd: cwd("precision-test/my-app") });
    const paths = result.map(s => s.absolutePath);
    // Only the file: dep should surface
    expect(paths).toContain(cwd("precision-test/my-lib"));
    // Generic siblings should be filtered by >3 threshold
    expect(paths).not.toContain(cwd("precision-test/other-1"));
    expect(paths).not.toContain(cwd("precision-test/other-8"));
  });

  it("finds Maven multi-module projects", () => {
    const result = suggestDirectories({ cwd: cwd("maven-project/web") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("maven-project/core"));
    expect(paths).toContain(cwd("maven-project/api"));
  });

  it("finds workspace members when cwd is workspace root", () => {
    const result = suggestDirectories({ cwd: cwd("root-as-cwd") });
    const paths = result.map(s => s.absolutePath);
    expect(paths).toContain(cwd("root-as-cwd/packages/core"));
    expect(paths).toContain(cwd("root-as-cwd/packages/cli"));
  });
});
