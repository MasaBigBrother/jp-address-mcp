import { existsSync as _e } from "node:fs"; try { if (_e(".env") && typeof process.loadEnvFile==="function") process.loadEnvFile(".env"); } catch(_){}
/**
 * run_board.js
 * cronから1日1回叩く想定。AI役員会を回してオーナーへ日報を届ける。
 *   例) crontab:  0 8 * * *  cd /path/jp-address-mcp && node scripts/run_board.js
 */
import { runDailyBoard } from '../agents/orchestrator.js';
import { notify } from '../agents/notify.js';

try {
  const out = await runDailyBoard(notify);
  console.error(`[board] done. llmCalls=${out.llmCalls}`);
} catch (e) {
  console.error('[board] error:', e.message);
  process.exit(1);
}
