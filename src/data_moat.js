/**
 * data_moat.js
 * ============================================================
 * 堀（データ・ネットワーク効果）の層
 *
 * 狙い（前回の議論の結論）:
 *   単なるOSSラッパーは誰でも真似できる。差がつくのは「使われて集まる
 *   データ」。特に “既存エンジンが失敗した入力” を貯めて潰していくと、
 *   「あそこは変な住所も通る」という後発が追えない精度差が生まれる。
 *
 * 記録するもの:
 *   - 呼び出し総数 / 成功数 / 失敗数（＝上物AI組織が読む「実データ」）
 *   - 失敗した生入力（＝堀を掘るための宝の山。手動 or AIで補正ルール化）
 *   - 収益（課金トランザクション）
 *
 * ストレージ:
 *   まずはローカルJSON（ConoHa上のファイル）。規模が出たらSQLite/Postgresへ。
 * ============================================================
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.MOAT_DIR || path.resolve('./data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const FAILS_FILE = path.join(DATA_DIR, 'failed_inputs.jsonl');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadStats() {
  try {
    const raw = await fs.readFile(STATS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      total_calls: 0,
      success: 0,
      fail: 0,
      verified: 0,
      revenue_calls: 0, // 課金が成立した回数
      first_seen: new Date().toISOString(),
      updated: null,
    };
  }
}

async function saveStats(stats) {
  await ensureDir();
  stats.updated = new Date().toISOString();
  await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
}

/**
 * 1呼び出しごとに mcp_server から呼ばれる。
 */
export async function recordUsage({ input, ok, level, verified, paidTxn }) {
  await ensureDir();
  const stats = await loadStats();

  stats.total_calls += 1;
  if (ok) stats.success += 1;
  else stats.fail += 1;
  if (verified) stats.verified += 1;
  if (paidTxn && !String(paidTxn).startsWith('free')) stats.revenue_calls += 1;

  await saveStats(stats);

  // 失敗 or 低レベル正規化(level<3)の入力は「堀を掘る素材」として保存
  if (!ok || (level && level < 3)) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      input,
      ok,
      level: level || 0,
    }) + '\n';
    await fs.appendFile(FAILS_FILE, line);
  }
}

/**
 * 上物のAI組織（社長・監査・事業計画）が読むためのスナップショット。
 */
export async function getStatsSnapshot() {
  const stats = await loadStats();
  const successRate = stats.total_calls
    ? (stats.success / stats.total_calls)
    : 0;
  return {
    ...stats,
    success_rate: Number(successRate.toFixed(4)),
  };
}

/**
 * 失敗入力の直近サンプル（堀を掘る作業＝AI/手動で補正ルール化する対象）。
 */
export async function getRecentFailures(limit = 50) {
  try {
    const raw = await fs.readFile(FAILS_FILE, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
