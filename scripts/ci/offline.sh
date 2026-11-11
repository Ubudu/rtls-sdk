#!/bin/sh
# The offline lane of CI: install, add Bun as a consumer runtime for the pack smoke test, run the offline gate.
set -eu
mkdir -p "$HOME"
npm ci --prefer-offline --no-audit --no-fund
npm install --global --no-audit --no-fund "bun@$BUN_VERSION"
PATH="$(npm prefix -g)/bin:$PATH"
export PATH
npm run ci:offline
