#!/bin/sh
# Release: build the package from the tagged commit and publish it to npm.
set -eu
mkdir -p "$HOME"
npm ci --no-audit --no-fund
npm run generate
npm run build
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
npm publish --access public
