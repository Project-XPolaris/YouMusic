#!/bin/bash

set -euo pipefail

# 使用 pnpm 安装依赖（通过 corepack 激活，若可用）
if command -v corepack >/dev/null 2>&1; then
  corepack enable || true
  corepack prepare pnpm@10.15.0 --activate || true
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm 未检测到，请先安装 pnpm 或启用 corepack。"
  exit 1
fi

pnpm install

sh ./install-service.sh