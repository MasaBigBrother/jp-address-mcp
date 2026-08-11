/**
 * test_wiring.js
 * 外部依存(OSSエンジン/Claude API)をモックし、内部配線を検証する。
 * ネットワーク不要。前処理層・データ堀・通知の流れが通るか確認する。
 */
import assert from 'node:assert';

// --- preclean/splitBuilding を単体検証するため、normalizer から関数を再実装抜粋 ---
// (本体はOSS importを含むため、ここでは前処理ロジックのみを移植して検証する)

function preclean(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw;
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const DASHES = '[‐-‒–—―ー−ｰ〜～]';
  let prev;
  do { prev = s; s = s.replace(new RegExp(`(\\d)${DASHES}(\\d)`, 'g'), '$1-$2'); } while (s !== prev);
  s = s.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/(\d+)\s*丁目/g, '$1-').replace(/(\d+)\s*番地?/g, '$1-')
       .replace(/(\d+)\s*号/g, '$1').replace(/-+/g, '-').replace(/-\s/g, '- ').replace(/-$/, '');
  return s;
}

function splitBuilding(addrTail) {
  if (!addrTail) return { building: '', room: '' };
  const roomPatterns = [
    /\s*([A-Za-z]?\d{2,4}号室?)\s*$/,
    /\s*(\d{1,2}F\s*\d{2,4})\s*$/i,
    /\s*([A-Za-z]?-?\d{3,4})\s*$/,
    /\s*(\d{1,2}階)\s*$/,
  ];
  for (const p of roomPatterns) {
    const m = addrTail.match(p);
    if (m) return { building: addrTail.slice(0, m.index).trim(), room: m[1].replace(/号室?$/, '').trim() };
  }
  return { building: addrTail.trim(), room: '' };
}

console.log('--- preclean 前処理層の検証 ---');
const c1 = preclean('神奈川県川崎市高津区溝の口１ー２ー３　サニーハイツ２０１');
console.log('  in : 神奈川県川崎市高津区溝の口１ー２ー３　サニーハイツ２０１');
console.log('  out:', c1);
assert.ok(c1.includes('1-2-3'), '全角→半角/長音→ハイフンが効いていない');
assert.ok(!c1.includes('　'), '全角スペースが残っている');
assert.ok(c1.includes('サニーハイツ'), '建物名の長音が壊れている(サニ-ハイツ問題)');

const c2 = preclean('東京都渋谷区神南１丁目２番３号');
console.log('  in : 東京都渋谷区神南１丁目２番３号');
console.log('  out:', c2);
assert.ok(c2.includes('1-2-3'), '丁目/番/号のハイフン寄せが効いていない');

console.log('  ✓ preclean OK\n');

console.log('--- splitBuilding 建物/部屋分離の検証 ---');
const b1 = splitBuilding('サニーハイツ201');
console.log('  サニーハイツ201 →', b1);
assert.strictEqual(b1.building, 'サニーハイツ');
assert.strictEqual(b1.room, '201');

const b2 = splitBuilding('グランドメゾン302号室');
console.log('  グランドメゾン302号室 →', b2);
assert.strictEqual(b2.room, '302');
console.log('  ✓ splitBuilding OK\n');

// --- データ堀の記録・集計の検証(実ファイルI/O) ---
console.log('--- data_moat 記録/集計の検証 ---');
process.env.MOAT_DIR = '/tmp/moat_test';
const { recordUsage, getStatsSnapshot, getRecentFailures } = await import('../src/data_moat.js');

// クリーン
import fs from 'node:fs/promises';
await fs.rm('/tmp/moat_test', { recursive: true, force: true });

await recordUsage({ input: '正常な住所', ok: true, level: 3, verified: true, paidTxn: 'ak-1' });
await recordUsage({ input: '崩れた住所xyz', ok: false, level: 0, verified: false, paidTxn: 'ak-2' });
await recordUsage({ input: '町名まで', ok: true, level: 1, verified: false, paidTxn: 'free-1' });

const snap = await getStatsSnapshot();
console.log('  stats:', JSON.stringify(snap));
assert.strictEqual(snap.total_calls, 3);
assert.strictEqual(snap.success, 2);
assert.strictEqual(snap.fail, 1);
assert.strictEqual(snap.revenue_calls, 2); // free-1 は課金にカウントしない

const fails = await getRecentFailures(10);
console.log('  堀の素材(失敗/低level):', fails.map(f => f.input));
assert.strictEqual(fails.length, 2); // 失敗1 + level<3 の1
console.log('  ✓ data_moat OK\n');

// --- 通知の検証(console mode) ---
console.log('--- notify 通知/承認の検証 ---');
process.env.NOTIFY_MODE = 'file';
process.env.REPORT_DIR = '/tmp/reports_test';
await fs.rm('/tmp/reports_test', { recursive: true, force: true });
const { notify, approve } = await import('../agents/notify.js');
const token = await notify({
  date: '2026-07-29',
  kpi: snap,
  audit: '異常なし。',
  plan: '打ち手: 失敗入力パターンを潰す。',
  report: '本日の要点: 呼び出し3件。承認事項なし。',
});
console.log('  発行トークン:', token);
const appr = await approve(token);
assert.ok(appr.ok, '承認が通らない');
console.log('  承認結果:', appr.ok ? 'approved' : 'failed');
console.log('  ✓ notify/approve OK\n');

console.log('==================================================');
console.log(' すべての内部配線テストに合格しました。');
console.log(' (OSSエンジン/Claude APIは本番でネットワーク結線)');
console.log('==================================================');
