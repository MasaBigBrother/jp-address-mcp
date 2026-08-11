import { existsSync } from 'node:fs';
try { if (existsSync('.env') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch (e) { console.error('[http] .env warn:', e.message); }
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { normalizeAddress } from './normalizer.js';
import { recordUsage } from './data_moat.js';
import { chargeForCall } from './payment.js';

const PORT = Number(process.env.HTTP_PORT || 3000);
const HOST = process.env.HTTP_HOST || '127.0.0.1';

// セッションID -> transport を記憶（握手を跨いで状態を保持）
const transports = {};

function buildServer() {
  const server = new Server({ name: 'jp-address-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: 'normalize_jp_address',
      description: 'Normalize and verify a Japanese postal address. Splits a raw Japanese address string into structured fields (prefecture, city, town, block number, building, room) and returns a verification flag plus lat/lng. Handles messy input: full-width chars, mixed hyphens, romaji, and building/room separation that generic parsers miss.',
      inputSchema: { type: 'object', properties: { address: { type: 'string', description: 'Raw Japanese address string.' } }, required: ['address'] },
    }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== 'normalize_jp_address') return { isError: true, content: [{ type: 'text', text: 'Unknown tool: ' + name }] };
    const pay = await chargeForCall(request);
    if (!pay.ok) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'payment_required', price_usdc: pay.price, pay_to: pay.payTo, scheme: 'x402' }) }] };
    const result = await normalizeAddress(args.address || '');
    await recordUsage({ input: args.address || '', ok: result.ok, level: result.ok ? result.level : 0, verified: result.ok ? result.verified : false, paidTxn: pay.txnId });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });
  return server;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

const httpServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }

  // 承認/却下の受付（メールのタップリンクから叩かれる）
  if (req.method === 'GET' && req.url.startsWith('/approve')) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const token = u.searchParams.get('token') || '';
      const action = u.searchParams.get('action') || 'approve';
      const mod = await import('../agents/notify.js');
      let msg;
      if (action === 'reject') {
        const r = await mod.reject(token);
        msg = r.ok ? '却下しました。' : '無効なトークンです（期限切れか処理済み）。';
      } else {
        const r = await mod.approve(token);
        msg = r.ok ? '承認しました。次回サイクルで反映されます。' : '無効なトークンです（期限切れか処理済み）。';
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>' + msg + '</h2><p>この画面は閉じて大丈夫です。</p></body></html>');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h2>エラー: ' + e.message + '</h2></body></html>');
    }
    return;
  }
  if (req.url !== '/mcp') { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }

  try {
    const sessionId = req.headers['mcp-session-id'];
    const body = await readBody(req);
    let transport;

    if (sessionId && transports[sessionId]) {
      // 既存セッション：記憶したtransportを使い回す
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(body)) {
      // 新規initialize：新しいtransportを作りセッションを記憶
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => { transports[sid] = transport; },
      });
      transport.onclose = () => { if (transport.sessionId) delete transports[transport.sessionId]; };
      const server = buildServer();
      await server.connect(transport);
    } else {
      // セッションIDが無い・不正でinitializeでもない
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID provided' }, id: null }));
      return;
    }

    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error('[http] request error:', e.message);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'internal_error' })); }
  }
});
httpServer.listen(PORT, HOST, () => {
  console.error('[jp-address-mcp] HTTP server on http://' + HOST + ':' + PORT + '/mcp');
  console.error('[jp-address-mcp] health: http://' + HOST + ':' + PORT + '/health');
});
