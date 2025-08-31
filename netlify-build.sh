#!/usr/bin/env bash
set -euo pipefail

# Rust / wasm-pack を用意
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  export PATH="$HOME/.cargo/bin:$PATH"
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  cargo install wasm-pack
fi

export PATH="$HOME/.cargo/bin:$PATH"

# ビルド（wasm + JSローダ生成）
cd crate
wasm-pack build --target web --release --out-dir ../web/pkg

# 公開用ディレクトリへコピー
cd ..
rm -rf dist
mkdir -p dist
rsync -a web/ dist/
echo "Build finished. dist/ ready."
