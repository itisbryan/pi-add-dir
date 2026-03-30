#!/bin/bash
set -euo pipefail

# Existing tests must still pass
npx vitest run --reporter=dot 2>&1 | tail -20
