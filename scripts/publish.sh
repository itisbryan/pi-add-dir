#!/bin/bash
# Publish to npm without devDependencies in the tarball.
# npm includes package.json in the tarball, and consumers run `npm install`
# which installs devDependencies too (228MB of eslint/typescript/vitest).
# This script strips devDependencies before packing, then restores them.
set -euo pipefail

echo "Stripping devDependencies for publish..."
cp package.json package.json.bak
node -e "
const pkg = require('./package.json');
delete pkg.devDependencies;
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Publishing..."
npm publish "$@" || { cp package.json.bak package.json; exit 1; }

echo "Restoring package.json..."
cp package.json.bak package.json
rm package.json.bak
echo "Done!"
