#!/usr/bin/env bash
# scripts/sync-lean4-extension.sh
#
# Usage: scripts/sync-lean4-extension.sh v0.0.220
#
# Pulls a clean copy of upstream leanprover/vscode-lean4 at the given tag,
# applies our patches (in vscode/extensions/lean4-patches/) on top, and
# replaces vscode/extensions/lean4 with the result.

set -euo pipefail

TAG="${1:?Usage: $0 <upstream-tag, e.g. v0.0.220>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$(mktemp -d)"
PATCH_DIR="$REPO_ROOT/vscode/extensions/lean4-patches"
TARGET_DIR="$REPO_ROOT/vscode/extensions/lean4"

trap 'rm -rf "$SCRATCH"' EXIT

echo "==> Fetching leanprover/vscode-lean4 @ $TAG into scratch dir"
git clone --depth 1 --branch "$TAG" https://github.com/leanprover/vscode-lean4.git "$SCRATCH/upstream"

UPSTREAM_EXT="$SCRATCH/upstream/vscode-lean4"

if [ ! -d "$UPSTREAM_EXT" ]; then
  echo "ERROR: expected subfolder vscode-lean4/ not found at tag $TAG."
  exit 1
fi

echo "==> Setting up scratch git repo from clean upstream"
WORK="$SCRATCH/work"
cp -r "$UPSTREAM_EXT" "$WORK"
cd "$WORK"
git init -q
git config user.email "sync@lean4code.local"
git config user.name "lean4code-sync"
git add -A
git commit -q -m "baseline: upstream vscode-lean4 $TAG"

echo "==> Applying local patches"
if [ -d "$PATCH_DIR" ] && ls "$PATCH_DIR"/*.patch >/dev/null 2>&1; then
  for patch in "$PATCH_DIR"/*.patch; do
    echo "  - applying $(basename "$patch")"
    if ! git am "$patch" 2>/dev/null; then
      echo "  !! $(basename "$patch") did not apply via git am, will need manual reconciliation"
      git am --abort 2>/dev/null || true
    fi
  done
else
  echo "  (no patches found in $PATCH_DIR, shipping unpatched upstream)"
fi

echo "==> Applying manual patch 2 directly (toPosix + react types), since it's simpler as direct edits than a diff"
python3 - <<'PYEOF'
import json

# webpack.config.js: add toPosix helper + wrap codicons/vscode-elements copy paths
path = 'webpack.config.js'
with open(path) as f:
    content = f.read()

marker = "const CopyPlugin = require('copy-webpack-plugin')\n"
if marker in content and 'toPosix' not in content:
    content = content.replace(marker, marker + "\nconst toPosix = p => p.split(path.sep).join('/')\n", 1)

old_codicons = "from: '../node_modules/@vscode/codicons/dist',"
new_codicons = "from: toPosix(path.resolve(__dirname, '../node_modules/@vscode/codicons/dist')),"
content = content.replace(old_codicons, new_codicons)

old_elements = "from: '../node_modules/@vscode-elements/elements/dist',"
new_elements = "from: toPosix(path.resolve(__dirname, '../node_modules/@vscode-elements/elements/dist')),"
content = content.replace(old_elements, new_elements)

with open(path, 'w') as f:
    f.write(content)
print("webpack.config.js patched")

# package.json: drop local @types/vscode, add react types
path2 = 'package.json'
with open(path2) as f:
    d = json.load(f)

dd = d.get('devDependencies', {})
if '@types/vscode' in dd:
    del dd['@types/vscode']
dd['@types/react'] = '^18.3.23'
dd['@types/react-dom'] = '^18.3.7'
d['devDependencies'] = dd

with open(path2, 'w') as f:
    json.dump(d, f, indent=2)
    f.write('\n')
print("package.json patched")
PYEOF

echo "==> Also verify projectinit.ts got the cloneLeanDojov2 method (from patch 1 or manual fallback)"
if ! grep -q "cloneLeanDojov2" src/projectinit.ts; then
  echo "  !! cloneLeanDojov2 not found in src/projectinit.ts — patch 1 did not apply and needs manual insertion per the instructions in the patch file comments"
fi

echo "==> Replacing $TARGET_DIR with patched result"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -r "$WORK"/. "$TARGET_DIR"/
rm -rf "$TARGET_DIR/.git"

echo "$TAG" > "$PATCH_DIR/UPSTREAM_TAG.txt"

echo ""
echo "==> Done syncing files. Now verify projectinit.ts actually has cloneLeanDojov2:"
grep -c "cloneLeanDojov2" "$TARGET_DIR/src/projectinit.ts" || echo "MISSING - needs manual fix, see patch 1 comments"
