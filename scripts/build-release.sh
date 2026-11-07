#!/usr/bin/env bash
# Builds the plugin zip that gets attached to a GitHub release, plus a
# CycloneDX SBOM of the node_modules that ships inside it.
#
# Usage: npm run build:release
# Output: dist/cdn-v<version>.zip and dist/cdn-v<version>.cdx.json
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(node -p "require('./plugin.json').version")
package_version=$(node -p "require('./package.json').version")

if [ "$version" != "$package_version" ]; then
    echo "Version mismatch: plugin.json is $version, package.json is $package_version" >&2
    exit 1
fi

out="dist"
stage="$out/cdn"
zip_name="cdn-v$version.zip"
sbom_name="cdn-v$version.cdx.json"

rm -rf "$out"
mkdir -p "$stage"

# Only the files the plugin needs. Tests, CI config and git files stay out.
cp -R assets LICENSE README.md main.js package.json package-lock.json plugin.json thumbnail.svg "$stage/"

# Install exactly what the lockfile says, without dev dependencies.
(cd "$stage" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)

# The SBOM describes the installed tree, so it matches what is in the zip.
(cd "$stage" && npm sbom --omit dev --sbom-format cyclonedx > "../$sbom_name")

(cd "$out" && zip -qrX "$zip_name" cdn)

echo "Built $out/$zip_name and $out/$sbom_name"
