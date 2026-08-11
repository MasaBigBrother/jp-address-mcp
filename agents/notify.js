/**
 * notify.js
 * ============================================================
 * オーナー(あなた)への通知＋承認の入口
 *
 * ゴール: あなたの操作を「日報を読む＋承認Yes/Noを押す」だけにする。
 *
 * 通知先は環境変数で選択:
 *   NOTIFY_MODE=console  … 動作確認用(標準出力)
 *   NOTIFY_MODE=email    … メール(SMTP)
 *   NOTIFY_MODE=slack    … Slack Incoming Webhook
 *   NOTIFY_MODE=file     … ローカルに日報を蓄積(あとでまとめて確認)
 *
 * 承認フロー:
 *   日報に「承認トークン」を1つ載せる。あなたが承認する場合だけ、
 *   用意された承認URL/コマンドを叩く(=クリック相当)。承認が来た提案
 *   だけを orchestrator の次サイクルが実行する。無操作=現状維持(安全側)。
 * ============================================================
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const getMode = () => process.env.NOTIFY_MODE || 'console';
const REPORT_DIR = process.env.REPORT_DIR || path.resolve('./reports');
const PENDING_FILE = path.join(REPORT_DIR, 'pending_approvals.json');

export async function notify(payload) {
  const token = crypto.randomBytes(8).toString('hex');
  const text = renderReport(payload, token);

  // 承認待ち事項を記録（承認が来たら次サイクルが参照）
  await savePending(token, payload);

  switch (getMode()) {
    case 'email':
      await sendEmail(text);
      break;
    case 'slack':
      await sendSlack(text);
      break;
    case 'file':
      await appendFile(text);
      break;
    case 'console':
    default:
      console.log('\n' + '='.repeat(60));
      console.log(text);
      console.log('='.repeat(60) + '\n');
  }
  return token;
}

function renderReport(p, token) {
  const base = process.env.PUBLIC_HOMEPAGE || "https://jp-addr.streamfront.net";
  return `📋 GB-Address 技マシン屋 日次報告  (${p.date})

${p.report}

──────────────────────────────
[承認が必要な場合のみ、下のリンクをタップ]

✅ 承認する:
${base}/approve?token=${token}&action=approve

❌ 却下する:
${base}/approve?token=${token}&action=reject

何もしなければ現状維持（安全側）です。
──────────────────────────────
(監査所見・事業計画の全文は reports/ に保存済み)`;
}

async function savePending(token, payload) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  let pending = {};
  try {
    pending = JSON.parse(await fs.readFile(PENDING_FILE, 'utf8'));
  } catch {
    /* first time */
  }
  pending[token] = {
    date: payload.date,
    plan: payload.plan,
    created: new Date().toISOString(),
    status: 'pending',
  };
  await fs.writeFile(PENDING_FILE, JSON.stringify(pending, null, 2));
}

/** あなたが承認を押したとき呼ばれる（承認サーバ or CLIから） */
export async function approve(token) {
  const pending = JSON.parse(await fs.readFile(PENDING_FILE, 'utf8'));
  if (!pending[token]) return { ok: false, reason: 'unknown_token' };
  pending[token].status = 'approved';
  pending[token].approved_at = new Date().toISOString();
  await fs.writeFile(PENDING_FILE, JSON.stringify(pending, null, 2));
  return { ok: true, plan: pending[token].plan };
}

/** 却下（メールの却下リンクから呼ばれる） */
export async function reject(token) {
  const pending = JSON.parse(await fs.readFile(PENDING_FILE, 'utf8'));
  if (!pending[token]) return { ok: false, reason: 'unknown_token' };
  pending[token].status = 'rejected';
  pending[token].rejected_at = new Date().toISOString();
  await fs.writeFile(PENDING_FILE, JSON.stringify(pending, null, 2));
  return { ok: true };
}

// ---- 通知チャネル実装（本番はネットワーク前提。ここは差し込み口） ----
async function sendEmail(text) {
  // Gmailのアプリパスワードを使ってSMTP送信する。
  // .env に以下を設定:
  //   SMTP_USER = 送信元Gmailアドレス
  //   SMTP_PASS = Gmailで発行したアプリパスワード（16桁）
  //   MAIL_TO   = 送信先（未設定なら SMTP_USER に送る＝自分宛て）
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.MAIL_TO || user;
  if (!user || !pass) {
    console.error('[notify:email] SMTP_USER / SMTP_PASS 未設定。送信スキップ。');
    return;
  }
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  try {
    await transporter.sendMail({
      from: `"GB技マシン屋 役員会" <${user}>`,
      to,
      subject: `【日報】jp-address MCP ${new Date().toISOString().slice(0,10)}`,
      text,
    });
    console.error('[notify:email] 送信成功 →', to);
  } catch (e) {
    console.error('[notify:email] 送信失敗:', e.message);
  }
}
async function sendSlack(text) {
  // 実デプロイ: SLACK_WEBHOOK_URL に POST
  console.error('[notify:slack] (本番でWebhook結線) 本文↓\n' + text);
}
async function appendFile(text) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.appendFile(
    path.join(REPORT_DIR, 'daily_reports.log'),
    '\n' + text + '\n'
  );
}
