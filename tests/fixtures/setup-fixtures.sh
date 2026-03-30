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

# ---------------------------------------------------------------------------
# Scenario 22: Nx monorepo (project.json per package, nx.json at root)
# CWD: nx-mono/apps/frontend
# Expected: nx-mono/libs/shared, nx-mono/apps/backend
# ---------------------------------------------------------------------------
mkdir -p "$BASE/nx-mono/apps/frontend"
mkdir -p "$BASE/nx-mono/apps/backend"
mkdir -p "$BASE/nx-mono/libs/shared"

# Nx with package.json workspaces (most common setup)
echo '{"name": "nx-mono", "workspaces": ["apps/*", "libs/*"]}' > "$BASE/nx-mono/package.json"
echo '{"name": "frontend"}' > "$BASE/nx-mono/apps/frontend/package.json"
echo '{"targets": {}}' > "$BASE/nx-mono/apps/frontend/project.json"
echo '{"name": "backend"}' > "$BASE/nx-mono/apps/backend/package.json"
echo '{"targets": {}}' > "$BASE/nx-mono/apps/backend/project.json"
echo '{"name": "shared"}' > "$BASE/nx-mono/libs/shared/package.json"
echo '{"targets": {}}' > "$BASE/nx-mono/libs/shared/project.json"
echo '# Shared conventions' > "$BASE/nx-mono/libs/shared/AGENTS.md"
echo '{}' > "$BASE/nx-mono/nx.json"
git -C "$BASE/nx-mono" init -q

# ---------------------------------------------------------------------------
# Scenario 23: Maven multi-module
# CWD: maven-project/web
# Expected: maven-project/core, maven-project/api
# ---------------------------------------------------------------------------
mkdir -p "$BASE/maven-project/web/src"
mkdir -p "$BASE/maven-project/core/src"
mkdir -p "$BASE/maven-project/api/src"

cat > "$BASE/maven-project/pom.xml" << 'EOF'
<project>
  <groupId>com.example</groupId>
  <artifactId>parent</artifactId>
  <packaging>pom</packaging>
  <modules>
    <module>web</module>
    <module>core</module>
    <module>api</module>
  </modules>
</project>
EOF
echo '<project><artifactId>web</artifactId></project>' > "$BASE/maven-project/web/pom.xml"
echo '<project><artifactId>core</artifactId></project>' > "$BASE/maven-project/core/pom.xml"
echo '# Core library' > "$BASE/maven-project/core/AGENTS.md"
echo '<project><artifactId>api</artifactId></project>' > "$BASE/maven-project/api/pom.xml"
git -C "$BASE/maven-project" init -q

# ---------------------------------------------------------------------------
# Scenario 24: CWD is the workspace root itself
# CWD: root-as-cwd (has workspaces field + packages)
# Expected: root-as-cwd/packages/core, root-as-cwd/packages/cli
# ---------------------------------------------------------------------------
mkdir -p "$BASE/root-as-cwd/packages/core"
mkdir -p "$BASE/root-as-cwd/packages/cli"

echo '{"name": "root-mono", "workspaces": ["packages/*"]}' > "$BASE/root-as-cwd/package.json"
echo '{"name": "core"}' > "$BASE/root-as-cwd/packages/core/package.json"
echo '# Core rules' > "$BASE/root-as-cwd/packages/core/AGENTS.md"
echo '{"name": "cli"}' > "$BASE/root-as-cwd/packages/cli/package.json"
git -C "$BASE/root-as-cwd" init -q

# ---------------------------------------------------------------------------
# Scenario 25: Yarn Berry link: and portal: protocols
# CWD: yarn-berry/app
# Expected: yarn-berry/shared (link:), yarn-berry/utils (portal:)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/yarn-berry/app"
mkdir -p "$BASE/yarn-berry/shared"
mkdir -p "$BASE/yarn-berry/utils"

echo '{"name": "app", "dependencies": {"shared": "link:../shared", "utils": "portal:../utils"}}' > "$BASE/yarn-berry/app/package.json"
echo '{"name": "shared"}' > "$BASE/yarn-berry/shared/package.json"
echo '# Shared rules' > "$BASE/yarn-berry/shared/AGENTS.md"
echo '{"name": "utils"}' > "$BASE/yarn-berry/utils/package.json"
git -C "$BASE/yarn-berry/app" init -q
git -C "$BASE/yarn-berry/shared" init -q
git -C "$BASE/yarn-berry/utils" init -q

# ---------------------------------------------------------------------------
# Scenario 26: uv Python workspace
# CWD: uv-workspace/packages/api
# Expected: uv-workspace/packages/core, uv-workspace/libs/shared
# ---------------------------------------------------------------------------
mkdir -p "$BASE/uv-workspace/packages/api"
mkdir -p "$BASE/uv-workspace/packages/core"
mkdir -p "$BASE/uv-workspace/libs/shared"

cat > "$BASE/uv-workspace/pyproject.toml" << 'EOF'
[project]
name = "uv-mono"

[tool.uv.workspace]
members = ["packages/*", "libs/*"]
EOF
cat > "$BASE/uv-workspace/packages/api/pyproject.toml" << 'EOF'
[project]
name = "api"
EOF
cat > "$BASE/uv-workspace/packages/core/pyproject.toml" << 'EOF'
[project]
name = "core"
EOF
echo '# Core library' > "$BASE/uv-workspace/packages/core/CLAUDE.md"
cat > "$BASE/uv-workspace/libs/shared/pyproject.toml" << 'EOF'
[project]
name = "shared"
EOF
git -C "$BASE/uv-workspace" init -q

# ---------------------------------------------------------------------------
# Scenario 27: .NET solution with multiple projects
# CWD: dotnet-sln/src/WebApi
# Expected: dotnet-sln/src/Core, dotnet-sln/src/Infrastructure
# ---------------------------------------------------------------------------
mkdir -p "$BASE/dotnet-sln/src/WebApi"
mkdir -p "$BASE/dotnet-sln/src/Core"
mkdir -p "$BASE/dotnet-sln/src/Infrastructure"

cat > "$BASE/dotnet-sln/MyApp.sln" << 'SLNEOF'
Microsoft Visual Studio Solution File, Format Version 12.00
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "WebApi", "src\WebApi\WebApi.csproj", "{1}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Core", "src\Core\Core.csproj", "{2}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Infrastructure", "src\Infrastructure\Infrastructure.csproj", "{3}"
EndProject
SLNEOF
touch "$BASE/dotnet-sln/src/WebApi/WebApi.csproj"
touch "$BASE/dotnet-sln/src/Core/Core.csproj"
echo '# Domain rules' > "$BASE/dotnet-sln/src/Core/AGENTS.md"
touch "$BASE/dotnet-sln/src/Infrastructure/Infrastructure.csproj"
git -C "$BASE/dotnet-sln" init -q

# ---------------------------------------------------------------------------
# Scenario 28: PHP Composer with path repositories
# CWD: php-mono/app
# Expected: php-mono/packages/auth, php-mono/packages/mailer
# ---------------------------------------------------------------------------
mkdir -p "$BASE/php-mono/app"
mkdir -p "$BASE/php-mono/packages/auth"
mkdir -p "$BASE/php-mono/packages/mailer"

cat > "$BASE/php-mono/app/composer.json" << 'EOF'
{
  "name": "app/main",
  "repositories": [
    { "type": "path", "url": "../packages/*" }
  ]
}
EOF
echo '{"name": "app/auth"}' > "$BASE/php-mono/packages/auth/composer.json"
echo '# Auth package' > "$BASE/php-mono/packages/auth/AGENTS.md"
echo '{"name": "app/mailer"}' > "$BASE/php-mono/packages/mailer/composer.json"
git -C "$BASE/php-mono/app" init -q

# ---------------------------------------------------------------------------
# Scenario 29: Precision stress test — many irrelevant siblings with project markers
# CWD: precision-test/my-app (only has file: dep on my-lib)
# Expected: precision-test/my-lib ONLY
# There are 8 other sibling projects — none should be suggested (>3 threshold)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/precision-test/my-app"
mkdir -p "$BASE/precision-test/my-lib"
mkdir -p "$BASE/precision-test/other-1"
mkdir -p "$BASE/precision-test/other-2"
mkdir -p "$BASE/precision-test/other-3"
mkdir -p "$BASE/precision-test/other-4"
mkdir -p "$BASE/precision-test/other-5"
mkdir -p "$BASE/precision-test/other-6"
mkdir -p "$BASE/precision-test/other-7"
mkdir -p "$BASE/precision-test/other-8"

echo '{"name": "my-app", "dependencies": {"my-lib": "file:../my-lib"}}' > "$BASE/precision-test/my-app/package.json"
echo '{"name": "my-lib"}' > "$BASE/precision-test/my-lib/package.json"
for i in 1 2 3 4 5 6 7 8; do
  echo "{\"name\": \"other-$i\"}" > "$BASE/precision-test/other-$i/package.json"
  git -C "$BASE/precision-test/other-$i" init -q
done
git -C "$BASE/precision-test/my-app" init -q
git -C "$BASE/precision-test/my-lib" init -q

# ---------------------------------------------------------------------------
# Scenario 30: Symlinked dependency
# CWD: symlink-test/app (depends on ../lib which is a symlink to real-lib)
# Expected: the resolved real-lib path
# ---------------------------------------------------------------------------
mkdir -p "$BASE/symlink-test/app"
mkdir -p "$BASE/symlink-test/real-lib"

echo '{"name": "app", "dependencies": {"lib": "file:../lib"}}' > "$BASE/symlink-test/app/package.json"
echo '{"name": "real-lib"}' > "$BASE/symlink-test/real-lib/package.json"
echo '# Real lib rules' > "$BASE/symlink-test/real-lib/AGENTS.md"
ln -sf real-lib "$BASE/symlink-test/lib"  # symlink lib -> real-lib
git -C "$BASE/symlink-test/app" init -q

# ---------------------------------------------------------------------------
# Scenario 31: Flutter/Dart monorepo with pubspec.yaml path deps
# CWD: flutter-mono/apps/mobile
# Expected: flutter-mono/packages/core, flutter-mono/packages/ui
# ---------------------------------------------------------------------------
mkdir -p "$BASE/flutter-mono/apps/mobile"
mkdir -p "$BASE/flutter-mono/packages/core"
mkdir -p "$BASE/flutter-mono/packages/ui"

cat > "$BASE/flutter-mono/apps/mobile/pubspec.yaml" << 'EOF'
name: mobile
dependencies:
  core:
    path: ../../packages/core
  ui:
    path: ../../packages/ui
EOF
cat > "$BASE/flutter-mono/packages/core/pubspec.yaml" << 'EOF'
name: core
EOF
echo '# Core package' > "$BASE/flutter-mono/packages/core/AGENTS.md"
cat > "$BASE/flutter-mono/packages/ui/pubspec.yaml" << 'EOF'
name: ui
EOF
git -C "$BASE/flutter-mono" init -q

# ---------------------------------------------------------------------------
# Scenario 32: Nested workspaces — child workspace inside parent workspace
# CWD: nested-ws/packages/sub-mono/apps/dashboard
# The inner workspace (sub-mono) should be found, NOT the outer one
# Expected: nested-ws/packages/sub-mono/libs/common (inner workspace member)
# NOT expected: nested-ws/packages/other-pkg (outer workspace member)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/nested-ws/packages/sub-mono/apps/dashboard"
mkdir -p "$BASE/nested-ws/packages/sub-mono/libs/common"
mkdir -p "$BASE/nested-ws/packages/other-pkg"

echo '{"name": "outer-mono", "workspaces": ["packages/*"]}' > "$BASE/nested-ws/package.json"
echo '{"name": "sub-mono", "workspaces": ["apps/*", "libs/*"]}' > "$BASE/nested-ws/packages/sub-mono/package.json"
echo '{"name": "dashboard"}' > "$BASE/nested-ws/packages/sub-mono/apps/dashboard/package.json"
echo '{"name": "common"}' > "$BASE/nested-ws/packages/sub-mono/libs/common/package.json"
echo '# Common lib' > "$BASE/nested-ws/packages/sub-mono/libs/common/AGENTS.md"
echo '{"name": "other-pkg"}' > "$BASE/nested-ws/packages/other-pkg/package.json"
git -C "$BASE/nested-ws" init -q

# ---------------------------------------------------------------------------
# Scenario 33: Swift Package Manager with local package deps
# CWD: swift-project/App
# Expected: swift-project/CoreLib, swift-project/NetworkLib
# ---------------------------------------------------------------------------
mkdir -p "$BASE/swift-project/App/Sources"
mkdir -p "$BASE/swift-project/CoreLib/Sources"
mkdir -p "$BASE/swift-project/NetworkLib/Sources"

cat > "$BASE/swift-project/App/Package.swift" << 'SWIFTEOF'
// swift-tools-version:5.9
import PackageDescription
let package = Package(
    name: "App",
    dependencies: [
        .package(path: "../CoreLib"),
        .package(name: "NetworkLib", path: "../NetworkLib"),
    ]
)
SWIFTEOF
echo '// swift-tools-version:5.9' > "$BASE/swift-project/CoreLib/Package.swift"
echo '# Core Library' > "$BASE/swift-project/CoreLib/AGENTS.md"
echo '// swift-tools-version:5.9' > "$BASE/swift-project/NetworkLib/Package.swift"
git -C "$BASE/swift-project" init -q

# ---------------------------------------------------------------------------
# Scenario 34: Directory names with spaces and special chars
# CWD: "special chars/My App"
# Expected: "special chars/My Lib" (file: dep), "special chars/Core Module" (sibling + AGENTS.md)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/special chars/My App"
mkdir -p "$BASE/special chars/My Lib"
mkdir -p "$BASE/special chars/Core Module"

echo '{"name": "my-app", "dependencies": {"my-lib": "file:../My Lib"}}' > "$BASE/special chars/My App/package.json"
echo '{"name": "my-lib"}' > "$BASE/special chars/My Lib/package.json"
echo '{"name": "core-module"}' > "$BASE/special chars/Core Module/package.json"
echo '# Core rules' > "$BASE/special chars/Core Module/AGENTS.md"
git -C "$BASE/special chars/My App" init -q
git -C "$BASE/special chars/My Lib" init -q
git -C "$BASE/special chars/Core Module" init -q

# ---------------------------------------------------------------------------
# Scenario 35: Elixir umbrella with mix.exs path deps
# CWD: elixir-deps/apps/web
# Expected: elixir-deps/apps/core (sibling + AGENTS.md), elixir-deps/libs/shared (path dep)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/elixir-deps/apps/web"
mkdir -p "$BASE/elixir-deps/apps/core"
mkdir -p "$BASE/elixir-deps/libs/shared"

cat > "$BASE/elixir-deps/apps/web/mix.exs" << 'MIXEOF'
defmodule Web.MixProject do
  use Mix.Project
  def project do
    [app: :web, deps: deps()]
  end
  defp deps do
    [
      {:shared, path: "../../libs/shared"},
      {:core, in_umbrella: true}
    ]
  end
end
MIXEOF
touch "$BASE/elixir-deps/apps/core/mix.exs"
echo '# Core app' > "$BASE/elixir-deps/apps/core/AGENTS.md"
touch "$BASE/elixir-deps/libs/shared/mix.exs"
echo '# Shared lib' > "$BASE/elixir-deps/libs/shared/CLAUDE.md"
git -C "$BASE/elixir-deps" init -q

# ---------------------------------------------------------------------------
# Scenario 36: Malformed config files — engine should gracefully skip
# CWD: malformed/app (has broken package.json)
# Expected: malformed/lib (sibling with AGENTS.md, only 2 siblings so <=3 threshold)
# The broken package.json should not crash the engine
# ---------------------------------------------------------------------------
mkdir -p "$BASE/malformed/app"
mkdir -p "$BASE/malformed/lib"

# Broken JSON — trailing comma, missing closing brace
echo '{"name": "app", "dependencies": {"lib": "file:../lib",}}' > "$BASE/malformed/app/package.json"
echo '{"name": "lib"}' > "$BASE/malformed/lib/package.json"
echo '# Lib rules' > "$BASE/malformed/lib/AGENTS.md"
git -C "$BASE/malformed/app" init -q
git -C "$BASE/malformed/lib" init -q

# ---------------------------------------------------------------------------
# Scenario 37: Overlapping workspace configs (npm + pnpm at same root)
# CWD: overlap-ws/packages/app
# Expected: overlap-ws/packages/lib (should appear only once despite both configs)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/overlap-ws/packages/app"
mkdir -p "$BASE/overlap-ws/packages/lib"

echo '{"name": "overlap", "workspaces": ["packages/*"]}' > "$BASE/overlap-ws/package.json"
cat > "$BASE/overlap-ws/pnpm-workspace.yaml" << 'EOF'
packages:
  - 'packages/*'
EOF
echo '{"name": "app"}' > "$BASE/overlap-ws/packages/app/package.json"
echo '{"name": "lib"}' > "$BASE/overlap-ws/packages/lib/package.json"
echo '# Lib' > "$BASE/overlap-ws/packages/lib/AGENTS.md"
git -C "$BASE/overlap-ws" init -q

# ---------------------------------------------------------------------------
# Scenario 38: No .git anywhere — sibling detection without git root
# CWD: no-git/frontend (no .git, just package.json)
# Expected: no-git/backend (sibling, <=3 threshold with context files)
# ---------------------------------------------------------------------------
mkdir -p "$BASE/no-git/frontend"
mkdir -p "$BASE/no-git/backend"

echo '{"name": "frontend"}' > "$BASE/no-git/frontend/package.json"
echo '{"name": "backend"}' > "$BASE/no-git/backend/package.json"
echo '# Backend rules' > "$BASE/no-git/backend/AGENTS.md"
# No git init anywhere

echo "Fixtures created at $BASE"
