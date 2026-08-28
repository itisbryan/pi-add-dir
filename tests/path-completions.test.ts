import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completeDirectoryPaths } from "../extensions/pi-add-dir/path-completions.js";

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-add-dir-completion-"));
  fs.mkdirSync(path.join(cwd, "frontend"));
  fs.mkdirSync(path.join(cwd, "fraud-service"));
  fs.mkdirSync(path.join(cwd, "frontend", "packages"));
  fs.mkdirSync(path.join(cwd, ".hidden"));
  fs.writeFileSync(path.join(cwd, "file.txt"), "not a directory");
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe("completeDirectoryPaths", () => {
  it("completes directories relative to cwd and excludes files", () => {
    expect(completeDirectoryPaths("fr", cwd)).toEqual([
      {
        value: "fraud-service/",
        label: "fraud-service/",
        description: path.join(cwd, "fraud-service"),
      },
      {
        value: "frontend/",
        label: "frontend/",
        description: path.join(cwd, "frontend"),
      },
    ]);
  });

  it("preserves the typed relative parent while completing nested paths", () => {
    expect(completeDirectoryPaths("./frontend/pa", cwd)).toEqual([
      {
        value: "./frontend/packages/",
        label: "packages/",
        description: path.join(cwd, "frontend", "packages"),
      },
    ]);
  });

  it("completes absolute directory paths", () => {
    const prefix = `${cwd}${path.sep}front`;
    expect(completeDirectoryPaths(prefix, cwd)).toEqual([
      {
        value: `${cwd}${path.sep}frontend/`,
        label: "frontend/",
        description: path.join(cwd, "frontend"),
      },
    ]);
  });

  it("only includes hidden directories when the segment starts with a dot", () => {
    expect((completeDirectoryPaths("", cwd) ?? []).map((item) => item.label)).not.toContain(".hidden/");
    expect((completeDirectoryPaths(".", cwd) ?? []).map((item) => item.label)).toContain(".hidden/");
  });

  it("returns null when the parent directory cannot be read", () => {
    expect(completeDirectoryPaths("missing/path", cwd)).toBeNull();
  });
});
