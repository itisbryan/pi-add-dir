import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import addDirExtension from "../extensions/pi-add-dir/index.js";

type AddDirectoryTool = {
  execute: (
    toolCallId: string,
    params: { path: string; reason?: string },
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<unknown>;
};
function isAddDirectoryTool(value: unknown): value is AddDirectoryTool {
  if (!value || typeof value !== "object" || !("name" in value) || value.name !== "add_directory") {
    return false;
  }
  return "execute" in value && typeof value.execute === "function";
}


describe("add_directory skill reload", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    vi.useRealTimers();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not inject a custom message before the tool result", async () => {
    vi.useFakeTimers();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-add-dir-reload-test-"));
    const externalDir = path.join(tempDir, "external");
    const skillDir = path.join(externalDir, ".claude", "skills", "demo");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\ndescription: Demo\n---\n");

    const sendMessage = vi.fn();
    const sendUserMessage = vi.fn();
    const appendEntry = vi.fn();
    let addDirectoryTool: AddDirectoryTool | undefined;
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn((tool: unknown) => {
        if (isAddDirectoryTool(tool)) {
          addDirectoryTool = tool;
        }
      }),
      sendMessage,
      sendUserMessage,
      appendEntry,
    } as unknown as ExtensionAPI;

    addDirExtension(pi);

    const ctx = { cwd: tempDir, hasUI: false } as ExtensionContext;
    await addDirectoryTool?.execute("tooluse_1", { path: externalDir }, undefined, undefined, ctx);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendUserMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(sendUserMessage).toHaveBeenCalledWith("/reload", { deliverAs: "followUp" });
  });
});
