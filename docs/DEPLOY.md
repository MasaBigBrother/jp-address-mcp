# デプロイ手順書 ＆ 初動チェックリスト

このドキュメントは「あなたが1回だけ手を動かす初動」を全部まとめたものです。
これが済めば、以後は原則「日報を読む＋承認Yes/Noを押す」だけになります。

---

## 0. 全体像（何を建てたか）

- **土台（技マシン屋）**: AIエージェントが日本語住所を渡すと、構造化＋
  実在検証して返すMCPサーバー。使った分だけ自動課金。
- **上物（AI役員会）**: 実データを読んで日報を作り、増設を起案する社長／
  監査／事業計画のAI。承認だけあなたに投げる。

---

## 1. 初動チェックリスト（あなたが1回だけやること）

### ステップ順に、上から順番に。

- [ ] **1-1. ConoHaにNode 20+を用意**（既存VPSでOK）
- [ ] **1-2. コード一式を配置**
      `git clone` もしくはファイル転送で `/opt/jp-address-mcp` などに置く
- [ ] **1-3. 依存をインストール**
      ```
      cd /opt/jp-address-mcp
      npm install
      ```
      ここで住所正規化OSS(@geolonia/normalize-japanese-addresses)と
      MCP SDK、Anthropic SDKが入る。
- [ ] **1-4. 住所マスターデータの取得**
      OSSの初回はマスターデータDLが要る。READMEに従い取得（無料）。
- [ ] **1-5. `.env` を作成**
      `cp config/.env.example .env` して、まず `PAYMENT_MODE=free` のまま、
      `ANTHROPIC_API_KEY` だけ埋める。
- [ ] **1-6. 動作確認（課金なし）**
      ```
      npm run test:wiring     # 内部配線テスト（ネット不要）
      npm start               # MCPサーバー起動（stdio）
      ```
      Claude Desktop / Cursor / Codex のMCP設定にこのサーバーを登録し、
      「この住所を正規化して」と投げて構造化データが返ることを確認。
- [ ] **1-7. AI役員会の動作確認**
      ```
      npm run board           # 日報が reports/ に出る
      ```
- [ ] **1-8. 課金を有効化（初動は apikey 方式を推奨）**
      `.env` を `PAYMENT_MODE=apikey` に。最初の顧客に前払いクレジットを
      売り、`npm run grant -- <顧客キー> <回数>` で付与。
      ※ x402(機械間自動決済)は §4 参照。軌道に乗ってから。
- [ ] **1-9. 常駐化**
      systemd か pm2 でMCPサーバーを常駐させる（§3）。
- [ ] **1-10. cron登録**
      AI役員会を1日1回:
      `0 8 * * * cd /opt/jp-address-mcp && node scripts/run_board.js`

これで初動完了。以後の通常運転はあなたの操作＝日報確認＋承認のみ。

---

## 2. あなたが取得・契約するもの（一覧）

| 何 | 用途 | 費用感 |
|---|---|---|
| ConoHa VPS | 常駐サーバー | 既存活用 |
| Anthropic APIキー | AI役員会 | 従量（役員会は1日3回のみ→安い） |
| ドメイン1本 | 公開エンドポイント | 約1,500円/年 |
| (任意)Stripe or ウォレット | 課金の受取 | 従量 |

初期の現金支出はドメイン＋少額のAPIクレジットで、予算内に十分収まる。

---

## 3. 常駐化（systemd例）

```ini
# /etc/systemd/system/jp-address-mcp.service
[Unit]
Description=JP Address MCP server
After=network.target

[Service]
WorkingDirectory=/opt/jp-address-mcp
ExecStart=/usr/bin/node src/mcp_server.js
Restart=always
EnvironmentFile=/opt/jp-address-mcp/.env

[Install]
WantedBy=multi-user.target
```
```
systemctl enable --now jp-address-mcp
```

HTTP(SSE)で外部エージェントへ公開する場合は、nginxでリバースプロキシし
TLSを張る。stdioはローカル/同一ホストのエージェント向け。

---

## 4. x402（機械間自動決済）への移行

初動は apikey で確実に回収し、需要が見えたら x402 へ。

1. facilitator（決済網）を選ぶ（Stripe/Tempo系 or Coinbase系のx402対応）。
2. 受取アドレスを `PAY_TO_ADDRESS` に設定、`PAYMENT_MODE=x402`。
3. `src/payment.js` の `verifyX402Proof()` に facilitator の verify 呼び出しを結線。
4. これでエージェントが未払いで来ると402→自動決済→再試行、が機械間で完結し、
   **あなたの承認すら不要**な純粋自動課金になる。

---

## 5. 通常運転で起きること（あなた視点）

1. 毎朝、日報が届く（file/slack/email）。
2. 「本日承認事項なし」なら、読むだけ。何もしない＝現状維持（安全）。
3. 事業計画AIが増設や価格変更を起案した時だけ、`APPROVE <token>` で承認。
4. 承認された打ち手だけが次サイクルで反映される。

---

## 6. 正直な注意（これは魔法ではない）

- 立ち上げ初期は呼び出しが少なく、売上は小さい。薄利多売型なので、
  「最初の顧客（＝あなたのサーバーを呼ぶエージェントを持つ人/企業）」を
  どう見つけるかが最初の山。ここだけは自動化しきれず、告知・営業が要る。
- OSSのライセンス(MIT)と、住所データの出典表記を守ること。
- 課金・税務はあなた名義。売上が立ったら会計処理を忘れずに。
