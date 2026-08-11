#!/usr/bin/env bash
# ==========================================================
# setup.sh  —  ConoHa VPS上で一発セットアップ
# 使い方:  bash setup.sh
# ==========================================================
set -e

echo "=== jp-address-mcp セットアップ開始 ==="

# 1) Node バージョン確認
if ! command -v node >/dev/null 2>&1; then
  echo "!! Node が見つかりません。先に Node 20+ を入れてください。"
  echo "   例: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "!! Node が古いです (v$(node -v))。20以上にしてください。"
  exit 1
fi
echo "[ok] Node $(node -v)"

# 2) 依存インストール
echo "--- 依存をインストール中 (npm install) ---"
npm install

# 3) .env が無ければテンプレから作成
if [ ! -f .env ]; then
  cp config/.env.example .env
  echo "[ok] .env を作成しました。"
  echo "    → このあと .env を開いて ANTHROPIC_API_KEY を入れてください。"
else
  echo "[ok] .env は既に存在します。"
fi

# 4) 内部配線テスト（ネット不要・課金なし）
echo "--- 内部配線テスト ---"
npm run test:wiring

echo ""
echo "=== セットアップ完了 ==="
echo "次にやること:"
echo "  1) nano .env  で ANTHROPIC_API_KEY を入れる"
echo "  2) npm start           # MCPサーバーを起動して動作確認"
echo "  3) npm run board       # AI役員会を1回まわす（reports/ に日報）"
echo "  4) 問題なければ DEPLOY.md の常駐化(systemd)とcron登録へ"
