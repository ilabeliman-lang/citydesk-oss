#!/usr/bin/env bash
# NDU-UPG #351: CPU-only USDZ converter tools in a user venv beside the checkout (no root, no GPU).
# usd-core (Pixar OpenUSD, TOST-1.0 / modified Apache 2.0), usd2gltf (MIT), pygltflib (MIT), numpy (BSD), pillow (MIT-CMU).
set -euo pipefail
DIR="${SCAN_TOOLS_DIR:-$(cd "$(dirname "$0")/../../.." && pwd)/.ndu-scan-tools}"
PY="${PYTHON:-python3}"
"$PY" -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q "usd-core>=25" "usd2gltf==0.3.5" "pygltflib>=1.16" numpy pillow
echo "Scan tools ready: $DIR/venv/bin/python (set SCAN_PYTHON to override)"
