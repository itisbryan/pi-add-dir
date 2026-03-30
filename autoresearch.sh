#!/bin/bash
set -euo pipefail

# Quick syntax check — fail fast on broken TS
npx tsc --noEmit 2>&1 | head -20 || { echo "TYPECHECK FAILED"; exit 1; }

# Run the suggestion benchmark
npx tsx tests/suggestions.bench.ts
