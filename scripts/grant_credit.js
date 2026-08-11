/**
 * grant_credit.js
 * 前払いクレジット方式(初動の確実回収)で、顧客に使用回数を付与する。
 *   例) node scripts/grant_credit.js  CUSTOMER_API_KEY  10000
 * ※ x402の機械間自動決済が軌道に乗るまでの、確実な回収レール。
 */
import { grantCredit } from '../src/payment.js';

const [, , apiKey, countStr] = process.argv;
if (!apiKey || !countStr) {
  console.error('usage: node scripts/grant_credit.js <apiKey> <count>');
  process.exit(1);
}
const remaining = grantCredit(apiKey, Number(countStr));
console.log(`granted ${countStr} calls to ${apiKey}. remaining=${remaining}`);
console.log('注意: これはインメモリ台帳のデモ。本番はDB/Redisに永続化すること。');
