#!/bin/bash
# Creates realistic project structures for testing directory suggestions.
# Each scenario has a cwd and known-good expected suggestions.
set -euo pipefail

BASE="${1:-.}/test-projects"
rm -rf "$BASE"

# ---------------------------------------------------------------------------
# Scenario 1: Monorepo with packages/ and apps/
# CWD: monorepo/apps/web
# Expected: monorepo/packages/ui, monorepo/packages/shared, monorepo/apps/api
# ---------------------------------------------------------------------------
mkdir -p "$BASE/monorepo/packages/ui/.pi/skills/design-tokens"
mkdir -p "$BASE/monorepo/packages/shared"
mkdir -p "$BASE/monorepo/apps/web"
mkdir -p "$BASE/monorepo/apps/api"

echo '{"name": "monorepo", "workspaces": ["packages/*", "apps/*"]}' > "$BASE/monorepo/package.json"
echo '{"name": "@mono/web", "dependencies": {"@mono/ui": "workspace:*", "@mono/shared": "workspace:*"}}' > "$BASE/monorepo/apps/web/package.json"
echo '{"name": "@mono/api"}' > "$BASE/monorepo/apps/api/package.json"
echo '{"name": "@mono/ui"}' > "$BASE/monorepo/packages/ui/package.json"
echo '{"name": "@mono/shared"}' > "$BASE/monorepo/packages/shared/package.json"
echo "# UI guidelines" > "$BASE/monorepo/packages/ui/AGENTS.md"
echo "---\nname: design-tokens\ndescription: Design token management\n---\n# Design Tokens" > "$BASE/monorepo/packages/ui/.pi/skills/design-tokens/SKILL.md"
echo "# Shared library" > "$BASE/monorepo/packages/shared/CLAUDE.md"
git -C "$BASE/monorepo" init -q

# ---------------------------------------------------------------------------
# Scenario 2: Sibling projects with shared library
# CWD: projects/frontend
# Expected: projects/shared-lib (has AGENTS.md), projects/backend
# ---------------------------------------------------------------------------
mkdir -p "$BASE/projects/frontend"
mkdir -p "$BASE/projects/backend"
mkdir -p "$BASE/projects/shared-lib"
mkdir -p "$BASE/projects/random-notes"  # no project markers, should NOT be suggested

echo '{"name": "frontend", "dependencies": {"shared-lib": "file:../shared-lib"}}' > "$BASE/projects/frontend/package.json"
echo '{"name": "backend"}' > "$BASE/projects/backend/package.json"
echo '{"name": "shared-lib"}' > "$BASE/projects/shared-lib/package.json"
echo "# Shared rules" > "$BASE/projects/shared-lib/AGENTS.md"
# random-notes has no package.json, no AGENTS.md — just random files
echo "some notes" > "$BASE/projects/random-notes/notes.txt"
git -C "$BASE/projects/frontend" init -q
git -C "$BASE/projects/backend" init -q
git -C "$BASE/projects/shared-lib" init -q

# ---------------------------------------------------------------------------
# Scenario 3: Git submodules
# CWD: with-submodules (has .gitmodules referencing vendor/lib-a and vendor/lib-b)
# Expected: vendor/lib-a, vendor/lib-b
# ---------------------------------------------------------------------------
mkdir -p "$BASE/with-submodules/vendor/lib-a"
mkdir -p "$BASE/with-submodules/vendor/lib-b"
mkdir -p "$BASE/with-submodules/src"

echo '{"name": "main-project"}' > "$BASE/with-submodules/package.json"
echo "# Lib A rules" > "$BASE/with-submodules/vendor/lib-a/AGENTS.md"
echo '{"name": "lib-a"}' > "$BASE/with-submodules/vendor/lib-a/package.json"
echo '{"name": "lib-b"}' > "$BASE/with-submodules/vendor/lib-b/package.json"
cat > "$BASE/with-submodules/.gitmodules" << 'EOF'
[submodule "vendor/lib-a"]
	path = vendor/lib-a
	url = https://github.com/example/lib-a.git
[submodule "vendor/lib-b"]
	path = vendor/lib-b
	url = https://github.com/example/lib-b.git
EOF
git -C "$BASE/with-submodules" init -q

# ---------------------------------------------------------------------------
# Scenario 4: Ruby on Rails with local gem path deps
# CWD: rails-app
# Expected: rails-app/engines/auth, gems/shared-gem (sibling with Gemfile)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/rails-app/engines/auth"
mkdir -p "$BASE/gems/shared-gem"

echo "source 'https://rubygems.org'" > "$BASE/rails-app/Gemfile"
echo "gem 'auth', path: 'engines/auth'" >> "$BASE/rails-app/Gemfile"
echo "gem 'shared-gem', path: '../gems/shared-gem'" >> "$BASE/rails-app/Gemfile"
echo "# Auth engine" > "$BASE/rails-app/engines/auth/AGENTS.md"
touch "$BASE/rails-app/engines/auth/Gemfile"
echo "# Shared gem rules" > "$BASE/gems/shared-gem/CLAUDE.md"
touch "$BASE/gems/shared-gem/Gemfile"
git -C "$BASE/rails-app" init -q

# ---------------------------------------------------------------------------
# Scenario 5: Rust workspace with Cargo.toml
# CWD: rust-workspace/crates/app
# Expected: rust-workspace/crates/core, rust-workspace/crates/utils
# ---------------------------------------------------------------------------
mkdir -p "$BASE/rust-workspace/crates/app/src"
mkdir -p "$BASE/rust-workspace/crates/core/src"
mkdir -p "$BASE/rust-workspace/crates/utils/src"

cat > "$BASE/rust-workspace/Cargo.toml" << 'EOF'
[workspace]
members = ["crates/*"]
EOF
cat > "$BASE/rust-workspace/crates/app/Cargo.toml" << 'EOF'
[package]
name = "app"
[dependencies]
core = { path = "../core" }
utils = { path = "../utils" }
EOF
cat > "$BASE/rust-workspace/crates/core/Cargo.toml" << 'EOF'
[package]
name = "core"
EOF
echo "# Core crate" > "$BASE/rust-workspace/crates/core/AGENTS.md"
cat > "$BASE/rust-workspace/crates/utils/Cargo.toml" << 'EOF'
[package]
name = "utils"
EOF
git -C "$BASE/rust-workspace" init -q

# ---------------------------------------------------------------------------
# Scenario 6: Python monorepo with pyproject.toml
# CWD: py-mono/services/api
# Expected: py-mono/libs/core, py-mono/services/worker
# ---------------------------------------------------------------------------
mkdir -p "$BASE/py-mono/services/api"
mkdir -p "$BASE/py-mono/services/worker"
mkdir -p "$BASE/py-mono/libs/core"

cat > "$BASE/py-mono/pyproject.toml" << 'EOF'
[tool.hatch.envs.default]
dependencies = []
EOF
cat > "$BASE/py-mono/services/api/pyproject.toml" << 'EOF'
[project]
name = "api"
dependencies = ["core @ file:../../libs/core"]
EOF
cat > "$BASE/py-mono/services/worker/pyproject.toml" << 'EOF'
[project]
name = "worker"
EOF
cat > "$BASE/py-mono/libs/core/pyproject.toml" << 'EOF'
[project]
name = "core"
EOF
echo "# Core library" > "$BASE/py-mono/libs/core/CLAUDE.md"
git -C "$BASE/py-mono" init -q

# ---------------------------------------------------------------------------
# Scenario 7: Project with .pi/extensions in sibling
# CWD: ext-project/main-app
# Expected: ext-project/tooling (has .pi/extensions)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/ext-project/main-app"
mkdir -p "$BASE/ext-project/tooling/.pi/extensions/my-ext"

echo '{"name": "main-app"}' > "$BASE/ext-project/main-app/package.json"
echo '{"name": "tooling"}' > "$BASE/ext-project/tooling/package.json"
echo "export default () => {}" > "$BASE/ext-project/tooling/.pi/extensions/my-ext/index.ts"
echo "# Tooling conventions" > "$BASE/ext-project/tooling/AGENTS.md"
git -C "$BASE/ext-project/main-app" init -q
git -C "$BASE/ext-project/tooling" init -q

# ---------------------------------------------------------------------------
# Scenario 8: Go workspace with go.work
# CWD: go-workspace/cmd/server
# Expected: go-workspace/pkg/auth, go-workspace/internal/db
# ---------------------------------------------------------------------------
mkdir -p "$BASE/go-workspace/cmd/server"
mkdir -p "$BASE/go-workspace/pkg/auth"
mkdir -p "$BASE/go-workspace/internal/db"

cat > "$BASE/go-workspace/go.work" << 'EOF'
go 1.21
use (
    ./cmd/server
    ./pkg/auth
    ./internal/db
)
EOF
echo "module server" > "$BASE/go-workspace/cmd/server/go.mod"
echo "module auth" > "$BASE/go-workspace/pkg/auth/go.mod"
echo "module db" > "$BASE/go-workspace/internal/db/go.mod"
echo "# Auth package" > "$BASE/go-workspace/pkg/auth/AGENTS.md"
git -C "$BASE/go-workspace" init -q

# ---------------------------------------------------------------------------
# Scenario 9: Nested monorepo — app inside a monorepo inside a parent with siblings
# CWD: nested/monorepo/apps/dashboard
# Expected: nested/monorepo/packages/core, nested/monorepo/apps/admin
# NOT expected: nested/unrelated-project (different repo, >3 threshold applies)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/nested/monorepo/apps/dashboard"
mkdir -p "$BASE/nested/monorepo/apps/admin"
mkdir -p "$BASE/nested/monorepo/packages/core"
mkdir -p "$BASE/nested/unrelated-project"
mkdir -p "$BASE/nested/another-project"
mkdir -p "$BASE/nested/third-project"
mkdir -p "$BASE/nested/fourth-project"

echo '{"name": "nested-mono", "workspaces": ["packages/*", "apps/*"]}' > "$BASE/nested/monorepo/package.json"
echo '{"name": "dashboard"}' > "$BASE/nested/monorepo/apps/dashboard/package.json"
echo '{"name": "admin"}' > "$BASE/nested/monorepo/apps/admin/package.json"
echo '{"name": "core"}' > "$BASE/nested/monorepo/packages/core/package.json"
echo '# Core lib' > "$BASE/nested/monorepo/packages/core/AGENTS.md"
echo '{"name": "unrelated"}' > "$BASE/nested/unrelated-project/package.json"
echo '{"name": "another"}' > "$BASE/nested/another-project/package.json"
echo '{"name": "third"}' > "$BASE/nested/third-project/package.json"
echo '{"name": "fourth"}' > "$BASE/nested/fourth-project/package.json"
git -C "$BASE/nested/monorepo" init -q
git -C "$BASE/nested/unrelated-project" init -q
git -C "$BASE/nested/another-project" init -q
git -C "$BASE/nested/third-project" init -q
git -C "$BASE/nested/fourth-project" init -q

# ---------------------------------------------------------------------------
# Scenario 10: Mixed signals — dep path + sibling + context files
# CWD: mixed/app
# Expected: mixed/core (dep + AGENTS.md), mixed/helpers (dep only)
# NOT expected: mixed/archive (no dep, no context, >3 siblings)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/mixed/app"
mkdir -p "$BASE/mixed/core"
mkdir -p "$BASE/mixed/helpers"
mkdir -p "$BASE/mixed/archive"
mkdir -p "$BASE/mixed/legacy"
mkdir -p "$BASE/mixed/experiment"
mkdir -p "$BASE/mixed/sandbox"

echo '{"name": "app", "dependencies": {"core": "file:../core", "helpers": "file:../helpers"}}' > "$BASE/mixed/app/package.json"
echo '{"name": "core"}' > "$BASE/mixed/core/package.json"
echo '# Core rules' > "$BASE/mixed/core/AGENTS.md"
echo '{"name": "helpers"}' > "$BASE/mixed/helpers/package.json"
echo '{"name": "archive"}' > "$BASE/mixed/archive/package.json"
echo '{"name": "legacy"}' > "$BASE/mixed/legacy/package.json"
echo '{"name": "experiment"}' > "$BASE/mixed/experiment/package.json"
echo '{"name": "sandbox"}' > "$BASE/mixed/sandbox/package.json"
git -C "$BASE/mixed/app" init -q
git -C "$BASE/mixed/core" init -q
git -C "$BASE/mixed/helpers" init -q
git -C "$BASE/mixed/archive" init -q
git -C "$BASE/mixed/legacy" init -q
git -C "$BASE/mixed/experiment" init -q
git -C "$BASE/mixed/sandbox" init -q

# ---------------------------------------------------------------------------
# Scenario 11: Empty parent — cwd is a lone project
# CWD: lone-project
# Expected: nothing (no siblings, no deps, no workspace)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/lone-project/src"

echo '{"name": "lone"}' > "$BASE/lone-project/package.json"
git -C "$BASE/lone-project" init -q

# ---------------------------------------------------------------------------
# Scenario 12: Turborepo/pnpm with nested workspace globs
# CWD: turborepo/apps/marketing
# Expected: turborepo/packages/config, turborepo/packages/tsconfig, turborepo/apps/docs
# ---------------------------------------------------------------------------
mkdir -p "$BASE/turborepo/apps/marketing"
mkdir -p "$BASE/turborepo/apps/docs"
mkdir -p "$BASE/turborepo/packages/config"
mkdir -p "$BASE/turborepo/packages/tsconfig"

echo '{"name": "turborepo", "workspaces": ["apps/*", "packages/*"]}' > "$BASE/turborepo/package.json"
echo '{"name": "marketing"}' > "$BASE/turborepo/apps/marketing/package.json"
echo '{"name": "docs"}' > "$BASE/turborepo/apps/docs/package.json"
echo '{"name": "config"}' > "$BASE/turborepo/packages/config/package.json"
echo '{"name": "tsconfig"}' > "$BASE/turborepo/packages/tsconfig/package.json"
echo "# Config conventions" > "$BASE/turborepo/packages/config/CLAUDE.md"
git -C "$BASE/turborepo" init -q

# ---------------------------------------------------------------------------
# Scenario 13: Elixir umbrella app
# CWD: umbrella/apps/web
# Expected: umbrella/apps/core, umbrella/apps/mailer
# ---------------------------------------------------------------------------
mkdir -p "$BASE/umbrella/apps/web"
mkdir -p "$BASE/umbrella/apps/core"
mkdir -p "$BASE/umbrella/apps/mailer"

cat > "$BASE/umbrella/mix.exs" << 'ELIXIR'
defmodule Umbrella.MixProject do
  use Mix.Project
  def project do
    [apps_path: "apps"]
  end
end
ELIXIR
touch "$BASE/umbrella/apps/web/mix.exs"
touch "$BASE/umbrella/apps/core/mix.exs"
touch "$BASE/umbrella/apps/mailer/mix.exs"
echo "# Core library" > "$BASE/umbrella/apps/core/AGENTS.md"
git -C "$BASE/umbrella" init -q

# ---------------------------------------------------------------------------
# Scenario 14: Workspace member referencing ANOTHER member via path
# CWD: cross-ref/packages/api  (depends on packages/db via file:)
# Expected: cross-ref/packages/db, cross-ref/packages/utils (workspace sibling)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/cross-ref/packages/api"
mkdir -p "$BASE/cross-ref/packages/db"
mkdir -p "$BASE/cross-ref/packages/utils"

echo '{"name": "cross-ref", "workspaces": ["packages/*"]}' > "$BASE/cross-ref/package.json"
echo '{"name": "api", "dependencies": {"db": "file:../db"}}' > "$BASE/cross-ref/packages/api/package.json"
echo '{"name": "db"}' > "$BASE/cross-ref/packages/db/package.json"
echo '{"name": "utils"}' > "$BASE/cross-ref/packages/utils/package.json"
echo "# Database rules" > "$BASE/cross-ref/packages/db/CLAUDE.md"
git -C "$BASE/cross-ref" init -q

# ---------------------------------------------------------------------------
# Scenario 15: Deep nesting — cwd is 3 levels deep in a monorepo
# CWD: deep/monorepo/packages/ui/src/components (not a project root!)
# The suggestion engine should walk up to find the workspace root
# Expected: deep/monorepo/packages/shared (workspace sibling via parent project)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/deep/monorepo/packages/ui/src/components"
mkdir -p "$BASE/deep/monorepo/packages/shared"

echo '{"name": "deep-mono", "workspaces": ["packages/*"]}' > "$BASE/deep/monorepo/package.json"
echo '{"name": "ui"}' > "$BASE/deep/monorepo/packages/ui/package.json"
echo '{"name": "shared"}' > "$BASE/deep/monorepo/packages/shared/package.json"
echo '# Shared module' > "$BASE/deep/monorepo/packages/shared/CLAUDE.md"
git -C "$BASE/deep/monorepo" init -q

# ---------------------------------------------------------------------------
# Scenario 16: False positive trap — node_modules should NEVER be suggested
# CWD: trap/my-app
# Expected: trap/my-lib (sibling with AGENTS.md)
# NOT expected: trap/my-app/node_modules/some-pkg (has package.json but is a dep)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/trap/my-app/node_modules/some-pkg"
mkdir -p "$BASE/trap/my-lib"

echo '{"name": "my-app", "dependencies": {"my-lib": "file:../my-lib"}}' > "$BASE/trap/my-app/package.json"
echo '{"name": "some-pkg"}' > "$BASE/trap/my-app/node_modules/some-pkg/package.json"
echo '{"name": "my-lib"}' > "$BASE/trap/my-lib/package.json"
echo '# My lib' > "$BASE/trap/my-lib/AGENTS.md"
git -C "$BASE/trap/my-app" init -q
git -C "$BASE/trap/my-lib" init -q

# ---------------------------------------------------------------------------
# Scenario 17: Docker Compose microservices
# CWD: docker-micro/gateway
# Expected: docker-micro/auth-service, docker-micro/user-service
# ---------------------------------------------------------------------------
mkdir -p "$BASE/docker-micro/gateway"
mkdir -p "$BASE/docker-micro/auth-service"
mkdir -p "$BASE/docker-micro/user-service"

echo '{"name": "gateway"}' > "$BASE/docker-micro/gateway/package.json"
echo '{"name": "auth-service"}' > "$BASE/docker-micro/auth-service/package.json"
echo '# Auth service' > "$BASE/docker-micro/auth-service/AGENTS.md"
echo '{"name": "user-service"}' > "$BASE/docker-micro/user-service/package.json"
cat > "$BASE/docker-micro/gateway/docker-compose.yml" << 'EOF'
version: '3.8'
services:
  auth:
    build:
      context: ../auth-service
  users:
    build: ../user-service
EOF
git -C "$BASE/docker-micro/gateway" init -q
git -C "$BASE/docker-micro/auth-service" init -q
git -C "$BASE/docker-micro/user-service" init -q

# ---------------------------------------------------------------------------
# Scenario 18: TypeScript project references
# CWD: ts-refs/packages/app
# Expected: ts-refs/packages/types, ts-refs/packages/utils
# ---------------------------------------------------------------------------
mkdir -p "$BASE/ts-refs/packages/app"
mkdir -p "$BASE/ts-refs/packages/types"
mkdir -p "$BASE/ts-refs/packages/utils"

echo '{"name": "ts-refs", "workspaces": ["packages/*"]}' > "$BASE/ts-refs/package.json"
echo '{"name": "app"}' > "$BASE/ts-refs/packages/app/package.json"
cat > "$BASE/ts-refs/packages/app/tsconfig.json" << 'TSEOF'
{
  "compilerOptions": { "composite": true },
  "references": [
    { "path": "../types" },
    { "path": "../utils" }
  ]
}
TSEOF
echo '{"name": "types"}' > "$BASE/ts-refs/packages/types/package.json"
echo '# Type definitions' > "$BASE/ts-refs/packages/types/AGENTS.md"
echo '{"name": "utils"}' > "$BASE/ts-refs/packages/utils/package.json"
git -C "$BASE/ts-refs" init -q

# ---------------------------------------------------------------------------
# Scenario 19: pnpm workspace (pnpm-workspace.yaml, no package.json workspaces)
# CWD: pnpm-mono/apps/web
# Expected: pnpm-mono/packages/ui, pnpm-mono/packages/utils, pnpm-mono/apps/admin
# ---------------------------------------------------------------------------
mkdir -p "$BASE/pnpm-mono/apps/web"
mkdir -p "$BASE/pnpm-mono/apps/admin"
mkdir -p "$BASE/pnpm-mono/packages/ui"
mkdir -p "$BASE/pnpm-mono/packages/utils"

# No workspaces field in package.json — only pnpm-workspace.yaml
echo '{"name": "pnpm-mono"}' > "$BASE/pnpm-mono/package.json"
cat > "$BASE/pnpm-mono/pnpm-workspace.yaml" << 'EOF'
packages:
  - 'packages/*'
  - 'apps/*'
EOF
echo '{"name": "web"}' > "$BASE/pnpm-mono/apps/web/package.json"
echo '{"name": "admin"}' > "$BASE/pnpm-mono/apps/admin/package.json"
echo '{"name": "ui"}' > "$BASE/pnpm-mono/packages/ui/package.json"
echo '# UI library' > "$BASE/pnpm-mono/packages/ui/AGENTS.md"
echo '{"name": "utils"}' > "$BASE/pnpm-mono/packages/utils/package.json"
git -C "$BASE/pnpm-mono" init -q

# ---------------------------------------------------------------------------
# Scenario 20: Gradle multi-project (Android/JVM)
# CWD: android-app/app
# Expected: android-app/lib/core, android-app/lib/network
# ---------------------------------------------------------------------------
mkdir -p "$BASE/android-app/app/src"
mkdir -p "$BASE/android-app/lib/core/src"
mkdir -p "$BASE/android-app/lib/network/src"

cat > "$BASE/android-app/settings.gradle.kts" << 'EOF'
rootProject.name = "android-app"
include(":app", ":lib:core", ":lib:network")
EOF
touch "$BASE/android-app/build.gradle.kts"
touch "$BASE/android-app/app/build.gradle.kts"
touch "$BASE/android-app/lib/core/build.gradle.kts"
touch "$BASE/android-app/lib/network/build.gradle.kts"
echo '# Core library' > "$BASE/android-app/lib/core/AGENTS.md"
git -C "$BASE/android-app" init -q

# ---------------------------------------------------------------------------
# Scenario 21: Workspace member with pnpm + local file deps + context files
# Tests that multiple heuristics merge correctly and scoring is right
# CWD: combo/packages/api
# Expected: combo/packages/db (dep+workspace+CLAUDE.md), combo/packages/logger (workspace only)
# NOT expected: combo/tools/scripts (not a workspace member, no dep, >3 siblings)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/combo/packages/api"
mkdir -p "$BASE/combo/packages/db"
mkdir -p "$BASE/combo/packages/logger"
mkdir -p "$BASE/combo/tools/scripts"
mkdir -p "$BASE/combo/tools/ci"
mkdir -p "$BASE/combo/tools/docker"
mkdir -p "$BASE/combo/tools/k8s"

cat > "$BASE/combo/pnpm-workspace.yaml" << 'EOF'
packages:
  - 'packages/*'
EOF
echo '{"name": "combo"}' > "$BASE/combo/package.json"
echo '{"name": "api", "dependencies": {"db": "file:../db"}}' > "$BASE/combo/packages/api/package.json"
echo '{"name": "db"}' > "$BASE/combo/packages/db/package.json"
echo '# Database conventions' > "$BASE/combo/packages/db/CLAUDE.md"
echo '{"name": "logger"}' > "$BASE/combo/packages/logger/package.json"
echo '{"name": "scripts"}' > "$BASE/combo/tools/scripts/package.json"
echo '{"name": "ci"}' > "$BASE/combo/tools/ci/package.json"
echo '{"name": "docker"}' > "$BASE/combo/tools/docker/package.json"
echo '{"name": "k8s"}' > "$BASE/combo/tools/k8s/package.json"
git -C "$BASE/combo" init -q

echo "Fixtures created at $BASE"
