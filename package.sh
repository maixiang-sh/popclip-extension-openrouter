#!/bin/bash
set -euo pipefail

EXT_NAME="OpenRouter"
DIR_NAME="${EXT_NAME}.popclipext"
PACKAGE_NAME="${EXT_NAME}.popclipextz"
BUILD_DIR="builds"

echo "Type-checking TypeScript..."
npx tsc --noEmit

echo "Preparing extension directory..."
rm -rf "$DIR_NAME"
mkdir -p "$DIR_NAME"

REQUIRED_FILES=("Config.yaml" "action.ts" "openrouter_icon.svg" "README.md")
for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
  cp "$file" "$DIR_NAME/"
done

mkdir -p "$BUILD_DIR"
rm -f "$BUILD_DIR/$PACKAGE_NAME"

echo "Creating package..."
zip -rq "$BUILD_DIR/$PACKAGE_NAME" "$DIR_NAME"

rm -rf "$DIR_NAME"

echo "Package created: $BUILD_DIR/$PACKAGE_NAME"
echo "Double-click $BUILD_DIR/$PACKAGE_NAME to install or share it."
