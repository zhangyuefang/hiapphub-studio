#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../modules"
mkdir -p "$OUT_DIR"

MODULES=(hap-mod-crypto hap-mod-clipboard hap-mod-fs hap-mod-system hap-mod-http hap-mod-sqlite)

echo "🔨 编译 ${#MODULES[@]} 个支持库模块..."
for mod in "${MODULES[@]}"; do
  echo "  ▸ $mod"
  (cd "$SCRIPT_DIR/$mod" && cargo build --release 2>&1 | grep -E "Compiling|Finished|error|warning")
done

SRC_EXT="dylib"
case "$(uname -s)" in
  Linux*)  SRC_EXT="so" ;;
  MINGW*|MSYS*|CYGWIN*) SRC_EXT="dll" ;;
esac

echo "📦 复制产物到 $OUT_DIR (*.hal) ..."
for mod in "${MODULES[@]}"; do
  LIB_NAME="${mod//-/_}"
  SRC="$SCRIPT_DIR/$mod/target/release/lib${LIB_NAME}.${SRC_EXT}"
  if [ ! -f "$SRC" ]; then
    SRC="$SCRIPT_DIR/$mod/target/release/${LIB_NAME}.${SRC_EXT}"
  fi
  DEST="$OUT_DIR/${mod}.hal"
  if [ -f "$SRC" ]; then
    cp "$SRC" "$DEST"
    strip "$DEST" 2>/dev/null || true
    SIZE=$(du -h "$DEST" | cut -f1)
    echo "  ✓ $mod.hal → $SIZE"
  else
    echo "  ✗ $mod 产物未找到: $SRC"
  fi
done

DATA_LIB="$HOME/.hiapphub/lib"
mkdir -p "$DATA_LIB"
echo "📦 同步到运行时目录 $DATA_LIB ..."
cp "$OUT_DIR"/*.hal "$DATA_LIB"/ 2>/dev/null || true

echo ""
echo "📊 modules 目录内容:"
ls -lh "$OUT_DIR"/*.hal 2>/dev/null || echo "无 .hal 文件"
echo "✅ 完成"
