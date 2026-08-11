/**
 * orchestrator.js
 * ============================================================
 * AI組織の司令塔
 *
 * やること:
 *   1) 土台(技マシン屋)の実データ(stats + 失敗サンプル)を集める
 *   2) 監査AI → 事業計画AI → 社長AI の順に、実データを渡して意見を取る
 *   3) 社長AIの日報をオーナー(あなた)に届ける(下記 notify)
 *   4) 承認が必要な事項があれば、Yes/Noで答えられる形で提示する
 *
 * コスト上限ガード(罠2対策):
 *   - 1日1回だけ実行(cronで叩く想定)。無限会議をさせない。
 *   - 各AIは1回のみ呼ぶ(往復ループさせない)。
 *   - MAX_DAILY_LLM_CALLS を超えたら即停止。
 * ============================================================
 */

import { ROLES } from './roles.js';
import { MARKETING_ROLE, saveDraft, exportDirectoryListing } from './marketing.js';
import { getStatsSnapshot, getRecentFailures } from '../src/data_moat.js';

const MAX_DAILY_LLM_CALLS = Number(process.env.MAX_DAILY_LLM_CALLS || 4); // 監査/計画/マーケ/社長 = 4

// --- Claude API 呼び出し（本番は環境変数 ANTHROPIC_API_KEY を使用） ---
async function askExecutive(role, userContent) {
  // ネットワーク前提の本番実装。ここでは呼び出し形だけ定義。
  // 実デプロイ時:  npm i @anthropic-ai/sdk
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: process.env.EXEC_MODEL || 'claude-sonnet-5',
    max_tokens: 1024,
    system: role.system,
    messages: [{ role: 'user', content: userContent }],
  });
  return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

export async function runDailyBoard(notify) {
  let llmCalls = 0;
  const guard = () => {
    if (++llmCalls > MAX_DAILY_LLM_CALLS) {
      throw new Error('cost guard: exceeded MAX_DAILY_LLM_CALLS');
    }
  };

  // 1) 実データ収集
  const stats = await getStatsSnapshot();
  const failures = await getRecentFailures(30);

  const dataBlock = `
【本日の実データ】
${JSON.stringify(stats, null, 2)}

【既存エンジンが処理しきれなかった入力サンプル(堀を掘る素材)】
${failures.map((f) => `- ${f.input} (level=${f.level})`).join('\n') || '（サンプルなし）'}
`;

  // 2) 監査AI
  guard();
  const audit = await askExecutive(
    ROLES.auditor,
    `${dataBlock}\n上記データを監査し、規定の形式で報告してください。`
  );

  // 3) 事業計画AI（監査結果も渡す）
  guard();
  const plan = await askExecutive(
    ROLES.planner,
    `${dataBlock}\n【監査AIの所見】\n${audit}\n\n上記を踏まえ、次の一手を規定の型で1つだけ起案してください。`
  );

  // 3.5) マーケAI（告知の自動化：プル型導線を最優先で1施策起案＋下書き保存）
  guard();
  const marketing = await askExecutive(
    MARKETING_ROLE,
    `${dataBlock}\n【監査AIの所見】\n${audit}\n\n今週最も効く告知施策を1つだけ選び、` +
      `その下書き本文まで書いてください。プル型(MCPディレクトリ/SEO記事)を優先。`
  );
  // 下書きを保存し、ディレクトリ登録メタも書き出す（転記だけで登録できる状態に）
  await saveDraft('outreach', `draft_${new Date().toISOString().slice(0,10)}`, marketing);
  const listingFile = await exportDirectoryListing();

  // 4) 社長AI（監査・計画・マーケを統合して日報化）
  guard();
  const report = await askExecutive(
    ROLES.ceo,
    `${dataBlock}\n【監査AIの所見】\n${audit}\n\n【事業計画AIの起案】\n${plan}\n\n` +
      `【マーケAIの告知施策】\n${marketing}\n\n` +
      `以上を統合し、オーナー向けの日次報告を規定の構成で作成してください。`
  );

  // 5) オーナーへ通知（承認クリックはこの通知先で行う）
  await notify({
    date: new Date().toISOString().slice(0, 10),
    kpi: stats,
    audit,
    plan,
    marketing,
    listingFile,
    report,
  });

  return { stats, audit, plan, marketing, report, llmCalls };
}
