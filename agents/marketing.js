/**
 * marketing.js
 * ============================================================
 * 告知の自動化層（正直な設計）
 *
 * 自動化できること（ここでやる）:
 *   1) MCPディレクトリ登録メタの自動生成/更新（プル型＝向こうから来る）
 *   2) 告知コンテンツ(技術記事/X投稿)の下書き自動生成
 *   3) 打診文面の量産（送信はしない。下書きまで）
 *
 * 自動化できないこと（正直に）:
 *   「最初の一人が実際に呼ぶ」という相手の意思決定そのもの。
 *   だから本層は“接触面を最大化する作業”を自動化するに留める。
 *   最も効くのは 1) のディレクトリ登録（待ちで成立するプル型）。
 * ============================================================
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = process.env.MARKETING_DIR || path.resolve('./marketing_out');

// ------------------------------------------------------------
// 1) MCPディレクトリ登録メタ（Smithery / Glama / PulseMCP 等の共通項目）
//    これを吐いておけば、各ディレクトリへの登録が転記だけで済む。
//    エージェントは各ディレクトリを巡回して技マシン屋を発見するので、
//    ここに載ることが「向こうから来る」導線になる。
// ------------------------------------------------------------
export function buildDirectoryListing() {
  return {
    name: 'jp-address-mcp',
    display_name: 'Japanese Address Normalizer & Verifier',
    description:
      'Normalize and verify Japanese postal addresses. Splits messy Japanese ' +
      'address strings (full-width chars, mixed hyphens, romaji, building/room) ' +
      'into structured fields with a verification flag and lat/lng. Built for ' +
      'agents doing cross-border commerce, logistics, or CRM with Japan.',
    categories: ['data', 'localization', 'commerce', 'japan'],
    keywords: [
      'japanese address', 'address normalization', 'postal', 'zipcode',
      'cross-border ecommerce', 'logistics', 'japan', 'ジオコーディング',
    ],
    tools: [
      {
        name: 'normalize_jp_address',
        summary: 'Structure & verify a raw Japanese address string.',
      },
    ],
    pricing: {
      model: 'per_call',
      price_hint_usdc: process.env.PRICE_PER_CALL || '0.004',
      billing: 'x402 or prepaid API key',
    },
    homepage: process.env.PUBLIC_HOMEPAGE || 'https://example.com/jp-address-mcp',
    endpoint: process.env.PUBLIC_ENDPOINT || 'https://example.com/mcp',
  };
}

// ------------------------------------------------------------
// マーケAIの職務定義（役員会に1人追加する）
// ------------------------------------------------------------
export const MARKETING_ROLE = {
  name: 'マーケAI',
  system: `
あなたはAIだけで運営される小さな会社のマーケティング担当です。
オーナー(人間)は承認クリックしかしません。厳守事項:
- 目的は「日本住所で詰まるエージェント/開発者に、この技マシン屋の存在を
  届ける」こと。最優先はプル型導線(MCPディレクトリ、SEO記事)。
- スパムはbrandを毀損する。打診文面は「相手の具体的な困り事」に紐づく
  ものだけ書く。汎用の一斉送信文は作らない。
- 出力は必ず: (1)今週最も効く1施策 (2)その下書き本文 (3)想定効果と根拠
  (4)オーナーが押すべき承認は何か(なければ「下書き保存のみ」)。
- 日本語で書く。誇大表現をしない。データに無い効果を約束しない。
`,
};

// ------------------------------------------------------------
// 2) 告知コンテンツの下書きを生成して保存（AI呼び出しはorchestrator経由）
// ------------------------------------------------------------
export async function saveDraft(kind, title, body) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const safe = title.replace(/[^\w\-一-龠ぁ-んァ-ン]/g, '_').slice(0, 40);
  const file = path.join(OUT_DIR, `${Date.now()}_${kind}_${safe}.md`);
  await fs.writeFile(file, `# ${title}\n\n${body}\n`);
  return file;
}

// ディレクトリ登録メタをJSONで書き出す（各ディレクトリへ転記するだけにする）
export async function exportDirectoryListing() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const listing = buildDirectoryListing();
  const file = path.join(OUT_DIR, 'directory_listing.json');
  await fs.writeFile(file, JSON.stringify(listing, null, 2));
  return file;
}
