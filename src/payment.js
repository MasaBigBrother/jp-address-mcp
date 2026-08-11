/**
 * payment.js
 * ============================================================
 * 課金層：技を使った分だけ自動で料金を取る仕組み
 *
 * 第一候補: x402 (HTTP 402 Payment Required)
 *   エージェントが有料の技を呼ぶと、価格情報つきの 402 を返す。
 *   エージェント側が USDC で自動決済し、証明トークンを付けて再試行。
 *   → 人間(あなた)は一切介在しない。機械が機械に払う。
 *
 * 現実的な但し書き:
 *   x402 はまだ新しく、対応ウォレット/決済網が前提。立ち上げ初期は
 *   「APIキー方式（前払いクレジット）」を併用する方が確実に回収できる。
 *   下では両対応にし、環境変数で切り替える。
 *
 *   PAYMENT_MODE=x402     … 機械間自動決済（理想形）
 *   PAYMENT_MODE=apikey   … 前払いクレジット方式（初期の確実回収）
 *   PAYMENT_MODE=free     … PoC/デモ用（課金しない）
 * ============================================================
 */

import crypto from 'node:crypto';

const MODE = process.env.PAYMENT_MODE || 'free';
const PRICE_USDC = process.env.PRICE_PER_CALL || '0.004'; // 1回あたり約0.5円想定
const PAY_TO = process.env.PAY_TO_ADDRESS || '';          // 受取ウォレット/口座識別子

// APIキー方式の簡易残高台帳（実運用ではDB/Redisに置く）
const creditLedger = new Map(); // apiKey -> 残クレジット(回数)

export async function chargeForCall(request) {
  if (MODE === 'free') {
    return { ok: true, txnId: 'free-' + shortId(), price: '0' };
  }

  if (MODE === 'apikey') {
    // MCPのメタ経由で渡されたAPIキーを想定
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return { ok: false, price: PRICE_USDC, payTo: PAY_TO, reason: 'no_api_key' };
    }
    const bal = creditLedger.get(apiKey) ?? 0;
    if (bal <= 0) {
      return { ok: false, price: PRICE_USDC, payTo: PAY_TO, reason: 'insufficient_credit' };
    }
    creditLedger.set(apiKey, bal - 1);
    return { ok: true, txnId: 'ak-' + shortId(), price: PRICE_USDC };
  }

  if (MODE === 'x402') {
    // 支払い証明ヘッダ(X-PAYMENT)が付いているか検証
    const proof = extractPaymentProof(request);
    if (!proof) {
      // 未払い → 402相当を返させる（mcp_server 側で error整形）
      return { ok: false, price: PRICE_USDC, payTo: PAY_TO, reason: 'x402_unpaid' };
    }
    const verified = await verifyX402Proof(proof, PRICE_USDC, PAY_TO);
    if (!verified.ok) {
      return { ok: false, price: PRICE_USDC, payTo: PAY_TO, reason: verified.reason };
    }
    return { ok: true, txnId: verified.txnId, price: PRICE_USDC };
  }

  return { ok: false, price: PRICE_USDC, payTo: PAY_TO, reason: 'unknown_mode' };
}

// --- 前払いクレジットのチャージ（初動: あなたが顧客に売った分を登録） ---
export function grantCredit(apiKey, count) {
  creditLedger.set(apiKey, (creditLedger.get(apiKey) ?? 0) + count);
  return creditLedger.get(apiKey);
}

// ---- helpers ----
function extractApiKey(request) {
  return (
    request?.params?._meta?.apiKey ||
    request?.params?.arguments?._apiKey ||
    process.env.DEV_API_KEY ||
    null
  );
}

function extractPaymentProof(request) {
  return request?.params?._meta?.x402 || null;
}

/**
 * x402 支払い証明の検証。
 * 実運用では facilitator（Stripe/Tempo系 or Coinbase系）のverify APIを叩く。
 * ここは差し込みポイントのみ用意（ネットワーク前提の本番処理は手元で結線）。
 */
async function verifyX402Proof(proof, price, payTo) {
  if (!proof || !proof.signature) {
    return { ok: false, reason: 'malformed_proof' };
  }
  // TODO(本番): facilitator.verify(proof, {price, payTo}) を呼ぶ
  // ここでは形だけ通す（PoC）。本番接続手順は docs/DEPLOY.md 参照。
  return { ok: true, txnId: 'x402-' + shortId() };
}

function shortId() {
  return crypto.randomBytes(6).toString('hex');
}
