#!/usr/bin/env bash
set -euo pipefail

# Recreate this project into a new directory by copying the exact source snapshot.
# Usage:
#   ./scripts/recreate-exact.sh [target_dir]
#   SOURCE_DIR=/path/to/source ./scripts/recreate-exact.sh [target_dir]
#   INSTALL_DEPS=1 RUN_CHECKS=1 ./scripts/recreate-exact.sh [target_dir]

SOURCE_DIR="${SOURCE_DIR:-/Users/xoxo/Documents/excal-dashboard}"
TARGET_DIR="${1:-$HOME/Desktop/excal-dashboard-recreated}"

if [[ ! -f "$SOURCE_DIR/package.json" ]]; then
  echo "Source directory is invalid: $SOURCE_DIR"
  exit 1
fi

mkdir -p "$TARGET_DIR"

echo "Copying project from:"
echo "  $SOURCE_DIR"
echo "to:"
echo "  $TARGET_DIR"

rsync -av \
  --exclude=".git/" \
  --exclude="node_modules/" \
  --exclude="dist/" \
  --exclude=".npm-cache/" \
  --exclude="coverage/" \
  --exclude="tmp/" \
  --exclude="out/" \
  --exclude="logs/" \
  --exclude=".env" \
  "$SOURCE_DIR"/ "$TARGET_DIR"/

if [[ ! -f "$TARGET_DIR/.env" ]]; then
  cat > "$TARGET_DIR/.env" <<'EOF'
VITE_API_TOKEN=replace_with_bearer_token
EPSILON_TOKEN=replace_with_bearer_token
EOF
fi

if [[ "${INSTALL_DEPS:-0}" == "1" ]]; then
  (cd "$TARGET_DIR" && npm install)
fi

if [[ "${RUN_CHECKS:-0}" == "1" ]]; then
  (
    cd "$TARGET_DIR"
    npm run typecheck
    npm test
    npm run build
  )
fi

echo "Recreate complete."
