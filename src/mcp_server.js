import { existsSync as _e2 } from "node:fs"; try { if (_e2(".env") && typeof process.loadEnvFile==="function") process.loadEnvFile(".env"); } catch(_){}
/**
 * mcp_server.js
 * ============================================================
 * 技マシン屋の受付：MCPサーバー本体
 *
 * これが「世界共通規格(MCP)でAIエージェントが立ち寄れる窓口」。
 * エージェントは tools/list で「この店にどんな技があるか」を発見し、
 * tools/call で実際に技を使う。
 *
 * 提供する技（tool）:
 *   - normalize_jp_address : 日本語住所を構造化データに正規化＋実在検証
 *
 * 実行方式: stdio (Claude Desktop / Cursor / Codex などが標準対応)
 *           + HTTP(SSE) はデプロイ手順書側で reverse proxy 経由で公開
 * ============================================================
 */

// 実デプロイ時にインストール: npm i @modelcontextprotocol/sdk
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { normalizeAddress } from './normalizer.js';
import { recordUsage } from './data_moat.js';
import { chargeForCall } from './payment.js';

const server = new Server(
  { name: 'jp-address-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// ------------------------------------------------------------
// 1) 技の一覧（エージェントが「何ができる店か」を発見する）
// ------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'normalize_jp_address',
      description:
        'Normalize and verify a Japanese postal address. Splits a raw Japanese ' +
        'address string into structured fields (prefecture, city, town, block ' +
        'number, building, room) and returns a verification flag plus lat/lng. ' +
        'Handles messy input: full-width chars, mixed hyphens, romaji, and ' +
        'building/room separation that generic parsers miss. Use whenever you ' +
        'need to register, validate, or route a Japanese address reliably.',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Raw Japanese address string to normalize.',
          },
        },
        required: ['address'],
      },
    },
  ],
}));

// ------------------------------------------------------------
// 2) 技の実行（エージェントが実際に呼ぶ / ここで課金＆記録）
// ------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'normalize_jp_address') {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  }

  // --- 課金（x402）。無銭リクエストはここで弾く ---
  const pay = await chargeForCall(request);
  if (!pay.ok) {
    // 402 相当。エージェントは価格情報を受け取り、支払って再試行する。
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'payment_required',
            price_usdc: pay.price,
            pay_to: pay.payTo,
            scheme: 'x402',
          }),
        },
      ],
    };
  }

  // --- 本処理 ---
  const result = await normalizeAddress(args.address || '');

  // --- 堀：使われるほど貯まるデータへ記録（成功/失敗どちらも） ---
  await recordUsage({
    input: args.address || '',
    ok: result.ok,
    level: result.ok ? result.level : 0,
    verified: result.ok ? result.verified : false,
    paidTxn: pay.txnId,
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
});

// ------------------------------------------------------------
// 起動
// ------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[jp-address-mcp] server running on stdio');
}

main().catch((e) => {
  console.error('[jp-address-mcp] fatal:', e);
  process.exit(1);
});
