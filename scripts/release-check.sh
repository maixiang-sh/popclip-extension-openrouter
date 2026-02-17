#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

EXT_NAME="OpenRouter"
PACKAGE_PATH="builds/${EXT_NAME}.popclipextz"
CONFIG_PATH="Config.yaml"
MIN_POPCLIP_VERSION=4225

fail() {
  echo "✗ $1" >&2
  exit 1
}

pass() {
  echo "✓ $1"
}

check_yaml_syntax() {
  command -v ruby >/dev/null 2>&1 || fail "Ruby is required for YAML syntax validation"
  ruby -e 'require "yaml"; YAML.load_file(ARGV[0])' "$CONFIG_PATH" >/dev/null \
    || fail "Config.yaml is not valid YAML"
  pass "Config.yaml YAML syntax is valid"
}

has_rg() {
  command -v rg >/dev/null 2>&1
}

matches_file() {
  local pattern="$1"
  local file="$2"
  if has_rg; then
    rg -q "$pattern" "$file"
  else
    grep -Eq "$pattern" "$file"
  fi
}

matches_text() {
  local pattern="$1"
  local text="$2"
  if has_rg; then
    printf '%s\n' "$text" | rg -q "$pattern"
  else
    printf '%s\n' "$text" | grep -Eq "$pattern"
  fi
}

check_required_files() {
  local files=("Config.yaml" "action.ts" "openrouter_icon.svg" "package.sh" "README.md")
  for file in "${files[@]}"; do
    [[ -f "$file" ]] || fail "Missing required file: $file"
  done
  pass "Required files exist"
}

check_config() {
  local version
  version="$(sed -nE 's/^popclip version:[[:space:]]*([0-9]+)[[:space:]]*$/\1/p' "$CONFIG_PATH" | head -n1)"
  [[ -n "$version" ]] || fail "Config.yaml must define a numeric 'popclip version'"
  (( version >= MIN_POPCLIP_VERSION )) || fail "popclip version must be >= ${MIN_POPCLIP_VERSION} (found ${version})"
  pass "popclip version is ${version} (>= ${MIN_POPCLIP_VERSION})"

  matches_file '^[[:space:]]*action:[[:space:]]*$' "$CONFIG_PATH" \
    || fail "Config.yaml must define action"
  matches_file '^[[:space:]]*javascript file:[[:space:]]*action\.ts[[:space:]]*$' "$CONFIG_PATH" \
    || fail "Config.yaml action must use 'javascript file: action.ts'"
  pass "Action entry points to action.ts"

  matches_file 'network' "$CONFIG_PATH" || fail "Config.yaml must include network entitlement"
  pass "Network entitlement present"
}

check_action_source() {
  matches_file 'async[[:space:]]+function[[:space:]]+run\(' "action.ts" || fail "action.ts must define async run()"
  matches_file 'run\(\);' "action.ts" || fail "action.ts must execute run()"
  if matches_file 'from[[:space:]]+"axios"|require\(["'"'"']axios["'"'"']\)' "action.ts"; then
    fail "action.ts must not depend on axios at runtime"
  fi
  pass "action.ts run() flow found"
}

check_types() {
  npx tsc --noEmit >/dev/null
  pass "TypeScript check passed"
}

build_package() {
  bash package.sh >/dev/null
  [[ -f "$PACKAGE_PATH" ]] || fail "Package was not created: $PACKAGE_PATH"
  pass "Package built: $PACKAGE_PATH"
}

check_package_contents() {
  local listing
  listing="$(unzip -l "$PACKAGE_PATH")"

  matches_text "OpenRouter\\.popclipext/" "$listing" || fail "Package missing extension root directory"
  matches_text "OpenRouter\\.popclipext/Config.yaml" "$listing" || fail "Package missing Config.yaml"
  matches_text "OpenRouter\\.popclipext/action.ts" "$listing" || fail "Package missing action.ts"
  matches_text "OpenRouter\\.popclipext/openrouter_icon\\.svg" "$listing" || fail "Package missing icon"
  matches_text "OpenRouter\\.popclipext/README.md" "$listing" || fail "Package missing README.md"
  pass "Package contents verified"
}

main() {
  check_required_files
  check_yaml_syntax
  check_config
  check_action_source
  check_types
  build_package
  check_package_contents
  echo "Release preflight passed."
}

main "$@"
