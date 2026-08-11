# 実践手順書（コピペで進める版）

SSHでVPSに入れるあなた向け。上から順にコピペしていけば動きます。
所要時間の目安: 15〜30分。

---

## 事前に手元で用意するもの（2つだけ）

1. **Anthropic APIキー**（AI役員会用）— console.anthropic.com で発行
2. **このファイル一式**（ダウンロード済みの `jp-address-mcp.tar.gz`）

---

## STEP 1: ファイルをVPSに送る

手元のPCのターミナルで（VPSの中ではない）:

```bash
# xxx.xxx.xxx.xxx はあなたのConoHa VPSのIP
scp jp-address-mcp.tar.gz root@xxx.xxx.xxx.xxx:/opt/
```

送れたらVPSに入る:

```bash
ssh root@xxx.xxx.xxx.xxx
```

---

## STEP 2: 展開してセットアップ

VPSの中で:

```bash
cd /opt
mkdir -p jp-address-mcp
tar -xzf jp-address-mcp.tar.gz -C jp-address-mcp
cd jp-address-mcp

# Nodeが未インストールなら（ConoHaのUbuntu想定）:
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt install -y nodejs

# 一発セットアップ（依存インストール＋.env作成＋配線テスト）
bash setup.sh
```

`すべての内部配線テストに合格しました` と出れば成功。

---

## STEP 3: APIキーを入れる

```bash
nano .env
```

`ANTHROPIC_API_KEY=` の右に、手元で用意したキーを貼り付けて保存
（nanoは Ctrl+O → Enter → Ctrl+X）。

このとき `PAYMENT_MODE=free` のままでOK。まず課金なしで動作確認する。

---

## STEP 4: 動くか確認

```bash
# MCPサーバーを起動（Ctrl+Cで止められる）
npm start
```

別のSSH窓 or ローカルのClaude Desktop/Cursor/CodexのMCP設定に、この
サーバーを登録して「この住所を正規化して: 東京都渋谷区神南1丁目2番3号」
と投げ、構造化データが返れば土台OK。

```bash
# AI役員会を1回まわす
npm run board
```

`reports/daily_reports.log` に日報、`marketing_out/` に告知下書きと
ディレクトリ登録メタ(directory_listing.json)が出れば上物OK。

---

## STEP 5: 告知（向こうから来る導線を作る）★重要

`marketing_out/directory_listing.json` の内容を、以下の「エージェントが
技マシン屋を探しに来る」ディレクトリに登録する。これがプル型導線＝
待ちで顧客が来る仕組み。ここだけは最初に手で登録が要る（各5〜10分）:

- Smithery (smithery.ai)
- Glama (glama.ai/mcp)
- PulseMCP (pulsemcp.com)
- 公式 modelcontextprotocol/servers のコミュニティ一覧(PR)

以後、登録内容の更新用メタは役員会が毎回自動で吐き直すので、
あなたは「変わったら転記する」だけ。

---

## STEP 6: 放置運転にする

```bash
# 常駐化（サーバーが落ちても自動再起動）
sudo cp docs/systemd-example.service /etc/systemd/system/jp-address-mcp.service
# ファイル内のパス/EnvironmentFileを確認して:
sudo systemctl daemon-reload
sudo systemctl enable --now jp-address-mcp

# AI役員会を毎朝8時に自動実行
crontab -e
# 末尾に1行追加:
# 0 8 * * * cd /opt/jp-address-mcp && node scripts/run_board.js
```

---

## これで完成後、あなたがやること

- 毎朝の日報を読む（file/slack/emailで届く）
- 承認事項があれば `APPROVE <token>` を叩く。無ければ何もしない
- marketing_out/ の告知下書きを、気が向いた時に投稿する（任意）
- ディレクトリ登録内容が変わったら転記する（稀）

## 課金を有効にするタイミング

呼び出しが実際に来始めたら、`.env` の `PAYMENT_MODE` を `apikey` にして、
最初の顧客に前払いクレジットを売る:
```bash
npm run grant -- 顧客のAPIキー 10000   # 1万回分を付与
```
機械間自動決済(x402)へ進むのは、需要が安定してから。DEPLOY.md §4参照。

---

## 正直な現実（もう一度）

土台と上物は自動で回る。だが「最初の一人が呼ぶ」まではタイムラグがある。
STEP 5のディレクトリ登録が、その一人と出会う一番確度の高い導線。
ここを最初にやるかどうかで、立ち上がりの速さが変わる。
