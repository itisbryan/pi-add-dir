/**
 * Benchmark for the directory suggestion engine.
 *
 * Runs the suggestion algorithm against realistic test fixtures and measures:
 * - suggestion_f1: F1 score (harmonic mean of precision and recall) — PRIMARY
 * - precision: fraction of suggestions that are correct
 * - recall: fraction of expected suggestions that were found
 * - latency_ms: time to generate suggestions
 *
 * Outputs METRIC lines for autoresearch.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { suggestDirectories } from "../extensions/pi-add-dir/suggestions.js";

// ---------------------------------------------------------------------------
// Test scenarios — each defines a cwd and expected suggestions
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  /** Relative path from fixtures base to use as cwd */
  cwd: string;
  /** Relative paths from fixtures base that should be suggested */
  expected: string[];
  /** Weight for this scenario (default 1) */
  weight?: number;
}

const SCENARIOS: Scenario[] = [
  {
    name: "monorepo-apps-web",
    cwd: "monorepo/apps/web",
    expected: [
      "monorepo/packages/ui",
      "monorepo/packages/shared",
      "monorepo/apps/api",
    ],
  },
  {
    name: "sibling-projects",
    cwd: "projects/frontend",
    expected: [
      "projects/shared-lib",
      "projects/backend",
      // random-notes should NOT appear (no project markers)
    ],
  },
  {
    name: "git-submodules",
    cwd: "with-submodules",
    expected: [
      "with-submodules/vendor/lib-a",
      "with-submodules/vendor/lib-b",
    ],
  },
  {
    name: "rails-gemfile-paths",
    cwd: "rails-app",
    expected: [
      "rails-app/engines/auth",
      "gems/shared-gem",
    ],
  },
  {
    name: "rust-workspace",
    cwd: "rust-workspace/crates/app",
    expected: [
      "rust-workspace/crates/core",
      "rust-workspace/crates/utils",
    ],
  },
  {
    name: "python-monorepo",
    cwd: "py-mono/services/api",
    expected: [
      "py-mono/libs/core",
      "py-mono/services/worker",
    ],
  },
  {
    name: "sibling-with-extensions",
    cwd: "ext-project/main-app",
    expected: [
      "ext-project/tooling",
    ],
  },
  {
    name: "go-workspace",
    cwd: "go-workspace/cmd/server",
    expected: [
      "go-workspace/pkg/auth",
      "go-workspace/internal/db",
    ],
  },
  {
    name: "nested-monorepo",
    cwd: "nested/monorepo/apps/dashboard",
    expected: [
      "nested/monorepo/packages/core",
      "nested/monorepo/apps/admin",
    ],
  },
  {
    name: "mixed-signals",
    cwd: "mixed/app",
    expected: [
      "mixed/core",
      "mixed/helpers",
    ],
  },
  {
    name: "lone-project",
    cwd: "lone-project",
    expected: [],
  },
  {
    name: "turborepo",
    cwd: "turborepo/apps/marketing",
    expected: [
      "turborepo/packages/config",
      "turborepo/packages/tsconfig",
      "turborepo/apps/docs",
    ],
  },
  {
    name: "elixir-umbrella",
    cwd: "umbrella/apps/web",
    expected: [
      "umbrella/apps/core",
      "umbrella/apps/mailer",
    ],
  },
  {
    name: "cross-ref-workspace",
    cwd: "cross-ref/packages/api",
    expected: [
      "cross-ref/packages/db",
      "cross-ref/packages/utils",
    ],
  },
  {
    name: "deep-nesting",
    cwd: "deep/monorepo/packages/ui/src/components",
    expected: [
      "deep/monorepo/packages/shared",
    ],
  },
  {
    name: "false-positive-trap",
    cwd: "trap/my-app",
    expected: [
      "trap/my-lib",
    ],
  },
  {
    name: "docker-compose",
    cwd: "docker-micro/gateway",
    expected: [
      "docker-micro/auth-service",
      "docker-micro/user-service",
    ],
  },
  {
    name: "ts-project-refs",
    cwd: "ts-refs/packages/app",
    expected: [
      "ts-refs/packages/types",
      "ts-refs/packages/utils",
    ],
  },
  {
    name: "pnpm-workspace",
    cwd: "pnpm-mono/apps/web",
    expected: [
      "pnpm-mono/packages/ui",
      "pnpm-mono/packages/utils",
      "pnpm-mono/apps/admin",
    ],
  },
  {
    name: "gradle-multi-project",
    cwd: "android-app/app",
    expected: [
      "android-app/lib/core",
      "android-app/lib/network",
    ],
  },
  {
    name: "combo-heuristics",
    cwd: "combo/packages/api",
    expected: [
      "combo/packages/db",
      "combo/packages/logger",
    ],
  },
  {
    name: "nx-monorepo",
    cwd: "nx-mono/apps/frontend",
    expected: [
      "nx-mono/libs/shared",
      "nx-mono/apps/backend",
    ],
  },
  {
    name: "maven-multi-module",
    cwd: "maven-project/web",
    expected: [
      "maven-project/core",
      "maven-project/api",
    ],
  },
  {
    name: "cwd-is-workspace-root",
    cwd: "root-as-cwd",
    expected: [
      "root-as-cwd/packages/core",
      "root-as-cwd/packages/cli",
    ],
  },
  {
    name: "yarn-berry-link-portal",
    cwd: "yarn-berry/app",
    expected: [
      "yarn-berry/shared",
      "yarn-berry/utils",
    ],
  },
  {
    name: "uv-python-workspace",
    cwd: "uv-workspace/packages/api",
    expected: [
      "uv-workspace/packages/core",
      "uv-workspace/libs/shared",
    ],
  },
  {
    name: "dotnet-solution",
    cwd: "dotnet-sln/src/WebApi",
    expected: [
      "dotnet-sln/src/Core",
      "dotnet-sln/src/Infrastructure",
    ],
  },
  {
    name: "php-composer-paths",
    cwd: "php-mono/app",
    expected: [
      "php-mono/packages/auth",
      "php-mono/packages/mailer",
    ],
  },
];

// ---------------------------------------------------------------------------
// Run benchmark
// ---------------------------------------------------------------------------

const FIXTURE_BASE = path.join(import.meta.dirname, "fixtures", "test-projects");

// Ensure fixtures exist
if (!fs.existsSync(FIXTURE_BASE)) {
  console.error("Setting up test fixtures...");
  execSync(`bash ${path.join(import.meta.dirname, "fixtures", "setup-fixtures.sh")} ${path.join(import.meta.dirname, "fixtures")}`, {
    stdio: "inherit",
  });
}

let totalPrecision = 0;
let totalRecall = 0;
let totalF1 = 0;
let totalWeight = 0;
let totalLatencyMs = 0;
let scenarioCount = 0;

// Warm up (JIT)
suggestDirectories({ cwd: path.join(FIXTURE_BASE, SCENARIOS[0].cwd) });

for (const scenario of SCENARIOS) {
  const cwd = path.join(FIXTURE_BASE, scenario.cwd);
  const expectedAbsolute = scenario.expected.map(e => path.join(FIXTURE_BASE, e));
  const weight = scenario.weight ?? 1;

  // Time the suggestion call (median of 5 runs)
  const times: number[] = [];
  let suggestions: ReturnType<typeof suggestDirectories> = [];

  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    suggestions = suggestDirectories({ cwd });
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const medianMs = times[Math.floor(times.length / 2)];

  const suggestedPaths = new Set(suggestions.map(s => s.absolutePath));
  const expectedSet = new Set(expectedAbsolute);

  // Edge case: both empty = perfect prediction
  if (suggestedPaths.size === 0 && expectedSet.size === 0) {
    const f1 = 1, precision = 1, recall = 1;
    const status = "✓";
    console.log(`${status} ${scenario.name}: F1=${f1.toFixed(2)} P=${precision.toFixed(2)} R=${recall.toFixed(2)} (${medianMs.toFixed(1)}ms) [empty=correct]`);
    totalPrecision += precision * weight;
    totalRecall += recall * weight;
    totalF1 += f1 * weight;
    totalWeight += weight;
    totalLatencyMs += medianMs;
    scenarioCount++;
    continue;
  }

  // Precision: of what we suggested, how many are in expected?
  const truePositives = [...suggestedPaths].filter(p => expectedSet.has(p)).length;
  const precision = suggestedPaths.size > 0 ? truePositives / suggestedPaths.size : 0;

  // Recall: of what's expected, how many did we find?
  const recall = expectedSet.size > 0 ? truePositives / expectedSet.size : 0;

  // F1 score
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  // Report per-scenario
  const missed = expectedAbsolute.filter(e => !suggestedPaths.has(e)).map(e => path.basename(e));
  const extra = [...suggestedPaths].filter(p => !expectedSet.has(p)).map(p => path.basename(p));

  const status = f1 === 1 ? "✓" : f1 > 0 ? "△" : "✗";
  console.log(
    `${status} ${scenario.name}: F1=${f1.toFixed(2)} P=${precision.toFixed(2)} R=${recall.toFixed(2)} (${medianMs.toFixed(1)}ms)` +
    (missed.length ? ` missed=[${missed.join(",")}]` : "") +
    (extra.length ? ` extra=[${extra.join(",")}]` : "")
  );

  totalPrecision += precision * weight;
  totalRecall += recall * weight;
  totalF1 += f1 * weight;
  totalWeight += weight;
  totalLatencyMs += medianMs;
  scenarioCount++;
}

// Aggregate
const avgF1 = totalF1 / totalWeight;
const avgPrecision = totalPrecision / totalWeight;
const avgRecall = totalRecall / totalWeight;
const avgLatencyMs = totalLatencyMs / scenarioCount;

console.log(`\n--- Aggregate ---`);
console.log(`METRIC suggestion_f1=${avgF1.toFixed(4)}`);
console.log(`METRIC precision=${avgPrecision.toFixed(4)}`);
console.log(`METRIC recall=${avgRecall.toFixed(4)}`);
console.log(`METRIC latency_ms=${avgLatencyMs.toFixed(2)}`);
