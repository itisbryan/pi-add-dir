import * as fs from "node:fs";
import * as path from "node:path";

export interface DirectoryCompletion {
  value: string;
  label: string;
  description: string;
}

/**
 * Complete directory paths while preserving the path style typed by the user.
 * Relative paths are resolved from the current pi working directory.
 */
export function completeDirectoryPaths(prefix: string, cwd: string): DirectoryCompletion[] | null {
  const lastSeparator = Math.max(prefix.lastIndexOf("/"), prefix.lastIndexOf("\\"));
  const typedParent = lastSeparator === -1 ? "" : prefix.slice(0, lastSeparator + 1);
  const partialName = prefix.slice(lastSeparator + 1);
  const parentPath = typedParent || ".";
  const searchDir = path.isAbsolute(parentPath)
    ? path.resolve(parentPath)
    : path.resolve(cwd, parentPath);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(searchDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const suggestions = entries
    .filter(entry => entry.isDirectory())
    .filter(entry => entry.name.startsWith(partialName))
    .filter(entry => partialName.startsWith(".") || !entry.name.startsWith("."))
    .map(entry => ({
      value: `${typedParent}${entry.name}${path.sep}`,
      label: `${entry.name}${path.sep}`,
      description: path.join(searchDir, entry.name),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return suggestions.length > 0 ? suggestions : null;
}
