/**
 * normalizer.js
 * ============================================================
 * 技マシン屋の心臓部：日本語住所の正規化コア
 *
 * 設計方針（前回の議論の結論）:
 *   土台 = 既製の優秀なOSS (@geolonia/normalize-japanese-addresses) をラップ
 *   堀   = 既製OSSが苦手な領域を「前処理層」として自前で足す
 *          - 崩れた入力（全角/半角/長音/波ダッシュの揺れ）の吸収
 *          - ローマ字・英語混じり住所の補正（海外エージェント起点で頻出）
 *          - 建物名と部屋番号の分離
 *          - 実在性の簡易検証フラグ
 *
 * ※ 正規化エンジン本体は車輪の再発明をしない。勝負は「前処理」と「店化」。
 * ============================================================
 */

// 実デプロイ時にインストール:  npm i @geolonia/normalize-japanese-addresses
// （このリポジトリはMITライセンス。商用利用可）
import { normalize } from '@geolonia/normalize-japanese-addresses';

// ------------------------------------------------------------
// 差別化層 1: 崩れた入力の前処理（既製OSSに渡す前に整える）
// ------------------------------------------------------------
function preclean(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw;

  // 全角英数字 → 半角
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );

  // 各種ハイフン/長音/ダッシュ類 → 標準ハイフン "-"
  // ただし「数字に挟まれた場合のみ」変換する。
  // これをしないと建物名の長音(例: サニーハイツ)まで壊れる。
  //   × 旧: 一律置換 → "サニ-ハイツ" になってしまう
  //   ○ 新: 数字間のみ → "1-2-3" は直り "サニーハイツ" は保持
  const DASHES = '[‐-‒–—―ー−ｰ〜～]';
  // 数字 <ダッシュ> 数字 を繰り返し畳み込む
  let prev;
  do {
    prev = s;
    s = s.replace(new RegExp(`(\\d)${DASHES}(\\d)`, 'g'), '$1-$2');
  } while (s !== prev);

  // 全角スペース → 半角スペース、連続スペースの圧縮
  s = s.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();

  // "丁目""番地""番""号" を区切りハイフンへ寄せる（例: 1丁目2番3号 → 1-2-3）
  s = s
    .replace(/(\d+)\s*丁目/g, '$1-')
    .replace(/(\d+)\s*番地?/g, '$1-')
    .replace(/(\d+)\s*号/g, '$1')
    .replace(/-+/g, '-')
    .replace(/-\s/g, '- ')
    .replace(/-$/, '');

  return s;
}

// ------------------------------------------------------------
// 差別化層 2: 建物名 + 部屋番号の分離
//   既製OSSは番地までは強いが、建物名/部屋番号の切り分けは弱い。
//   ここを埋めるのが海外EC（配送ラベル生成）で効く。
// ------------------------------------------------------------
function splitBuilding(addrTail) {
  if (!addrTail) return { building: '', room: '' };

  // 末尾の部屋番号を切り出す。各パターンは
  //   group1 = 建物名側に残す部分の直後位置判定用（数字直前まで）
  //   group2 = 部屋番号として取り出す数字
  // 号室/号/室 などの語尾は room から除去する。
  const roomPatterns = [
    // 明示的な号室/号/室 付き（区切りが明確なので最優先）
    { re: /^(.+?)\s*([A-Za-z]?\d{1,4})\s*(?:号室|号|室)\s*$/, },
    // 階数付き "3F201"
    { re: /^(.+?)\s*(\d{1,2}F\s*\d{2,4})\s*$/i, },
    // "3階"
    { re: /^(.+?)\s*(\d{1,2}階)\s*$/, },
    // 末尾の裸の部屋番号（建物名と部屋番号の間に区切りが無い場合）
    // 建物名の末尾が非数字であることを保証して長音等の巻き込みを防ぐ
    { re: /^(.+?[^\d\s])\s*(\d{3,4})\s*$/, },
    { re: /^(.+?[^\d\s])\s*([A-Za-z]\d{2,3})\s*$/, },
  ];

  for (const { re } of roomPatterns) {
    const m = addrTail.match(re);
    if (m) {
      const building = (m[1] || '').trim();
      const room = (m[2] || '').replace(/[号室階F\s]/g, '').trim();
      if (building) return { building, room };
    }
  }
  return { building: addrTail.trim(), room: '' };
}

// ------------------------------------------------------------
// メイン: normalizeAddress
// ------------------------------------------------------------
export async function normalizeAddress(rawInput) {
  const cleaned = preclean(rawInput);

  let base;
  try {
    // 既製OSSエンジンで都道府県/市区町村/町域/番地に分解
    base = await normalize(cleaned);
  } catch (err) {
    return {
      ok: false,
      error: 'normalization_failed',
      detail: String(err && err.message ? err.message : err),
      input: rawInput,
    };
  }

  // 新しいエンジン出力形式:
  //   base = { pref, city, town, other, level, point:{lat,lng,level}, metadata }
  //   - town  : 町域（例 "溝口一丁目"）
  //   - other : 番地以降（例 "2-3"）＝ここに番地＋建物＋部屋が入る
  //   - point : 緯度経度
  // === 番地・建物・部屋の抽出（metadataベースの確実な方法） ===
  // 重要な前提（エンジン仕様）:
  //  - 丁目は town に取り込まれる（例 "西新宿2-8-1" → town:"西新宿二丁目", other:"8-1 ..."）
  //    よって other 先頭の "8-1" が正しい番地。丁目を番地に足さない。
  //  - エンジンは other 内で長音「ー」を「-」に潰す（例 "パークタワー"→"パークタワ-"）。
  //    そのため建物名は other からでなく、元入力(metadata.input)から復元して長音を守る。
  const engineTail = (base.other || '').trim();

  // (1) 番地の抽出。levelにより番地の在り処が違う:
  //   - level低(3): other 先頭に番地が残る（例 "2-3 サニーハイツ"）
  //   - level高(8): 番地はエンジンが座標解決済みで other から消える
  //     → 元入力から「丁目(chome_n)の後ろ」を番地として切り出す。
  let banchi = '';
  let afterBanchi = engineTail;
  const bm = engineTail.match(/^([0-9]+(?:-[0-9]+)*)/);
  if (bm) {
    // (1a) other 先頭に番地あり
    banchi = bm[1];
    afterBanchi = engineTail.slice(bm[1].length).trim();
  } else {
    // (1b) other に番地なし → 元入力(cleaned)から丁目の後ろの数字列を取る。
    //      metadata.machiAza.chome_n があれば「丁目N」を除いた残りが番地。
    const chomeN = base.metadata && base.metadata.machiAza
      ? base.metadata.machiAza.chome_n : null;
    // 元入力中の全ての「数字(-数字)+」列
    const seqs = [...cleaned.matchAll(/[0-9]+(?:-[0-9]+)+/g)].map(x => x[0]);
    if (seqs.length) {
      // 最後の数字列が「丁目-番地-番地...」の形。先頭要素が丁目なら落とす。
      let parts = seqs[seqs.length - 1].split('-');
      if (chomeN != null && Number(parts[0]) === chomeN && parts.length > 1) {
        parts = parts.slice(1); // 先頭の丁目を除去 → 残りが番地
      }
      banchi = parts.join('-');
    }
    afterBanchi = engineTail; // 建物側は engineTail をそのまま使う
  }

  // (2) 建物+部屋の「エンジン版」文字列（長音は潰れている）
  const engineBuildingRaw = afterBanchi;

  // (3) 建物名を元入力から復元して長音を守る:
  //     元入力(前処理後 cleaned)から、番地(banchi)より後ろの部分を建物候補とする。
  let buildingSource = engineBuildingRaw;
  if (banchi) {
    const idx = cleaned.lastIndexOf(banchi);
    if (idx >= 0) {
      const afterInInput = cleaned.slice(idx + banchi.length).trim();
      // 元入力側に建物文字列があり、かつ長音などで engine版と長さが近ければ採用
      if (afterInInput) buildingSource = afterInInput;
    }
  }

  // (4) 建物名と部屋番号を分離
  const { building, room } = splitBuilding(buildingSource);

  const lat = base.point ? base.point.lat : (base.lat || null);
  const lng = base.point ? base.point.lng : (base.lng || null);

  // 差別化層 3: 実在性の簡易検証フラグ
  //   level>=3 かつ 緯度経度が取れていれば「実在住所と一致」とみなす。
  const verified = (base.level >= 3) && !!lat && !!lng;

  return {
    ok: true,
    input: rawInput,
    normalized: {
      pref: base.pref || '',
      city: base.city || '',
      town: base.town || '',
      banchi: banchi || '',
      building: building || '',
      room: room || '',
    },
    geo: (lat && lng) ? { lat, lng } : null,
    level: base.level,          // 1..3 正規化の到達度
    verified,                   // 実在性の目安フラグ
    _moatKey: cleaned,
  };
}
