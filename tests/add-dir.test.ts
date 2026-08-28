import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import addDirExtension from "../extensions/pi-add-dir/index.js";

type RegisteredCommand = {
  handler(args: string | undefined, ctx: ExtensionContext): Promise<void>;
};

const tempDirs: string[] = [];

function useTempStateDir(dir: string): void {
  vi.stubEnv("TMPDIR", dir);
  vi.stubEnv("TMP", dir);
  vi.stubEnv("TEMP", dir);
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function registerExtension(): Map<string, RegisteredCommand> {
  const commands = new Map<string, RegisteredCommand>();
  const pi = {
    on: vi.fn(),
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    registerTool: vi.fn(),
    appendEntry: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  addDirExtension(pi);
  return commands;
}

function makeContext(cwd: string, notify: ReturnType<typeof vi.fn>): ExtensionContext {
  return {
    cwd,
    hasUI: false,
    ui: { notify },
  } as unknown as ExtensionContext;
}

describe("add-dir command", () => {
  it("adds an existing literal ~user path", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-add-dir-command-test-"));
    tempDirs.push(cwd);
    useTempStateDir(cwd);
    fs.mkdirSync(path.join(cwd, "~user", "project"), { recursive: true });
    const notify = vi.fn();
    const command = registerExtension().get("add-dir");

    expect(command).toBeDefined();
    await command!.handler("~user/project", makeContext(cwd, notify));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Added project"), "info");
  });

  it("explains unsupported ~user expansion when the literal path is missing", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-add-dir-command-test-"));
    tempDirs.push(cwd);
    useTempStateDir(cwd);
    const notify = vi.fn();
    const command = registerExtension().get("add-dir");

    expect(command).toBeDefined();
    await command!.handler("~user/missing", makeContext(cwd, notify));
    expect(notify).toHaveBeenCalledWith("~user expansion isn't supported — use an absolute path.", "error");
  });
});
