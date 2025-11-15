import dotenv from 'dotenv';
dotenv.config();

import { setupContainer } from '../shared/container/ContainerSetup';
import { ResetMonthlyCreditsUseCase } from '../application/use-cases/billing/ResetMonthlyCreditsUseCase';

/**
 * Daily cron job to reset monthly credits for workspaces with expired billing periods
 *
 * Run this script daily using a scheduler (cron, systemd timer, or cloud scheduler):
 *
 * Example crontab entry (runs daily at midnight UTC):
 * 0 0 * * * cd /path/to/api && npm run reset-credits
 *
 * Or add to package.json scripts:
 * "reset-credits": "ts-node src/scripts/reset-monthly-credits.ts"
 */

async function main() {
  console.log('[CreditReset] Starting monthly credit reset job...');
  console.log('[CreditReset] Timestamp:', new Date().toISOString());

  try {
    const container = setupContainer();
    const resetMonthlyCreditsUseCase = container.get<ResetMonthlyCreditsUseCase>('resetMonthlyCreditsUseCase');

    const result = await resetMonthlyCreditsUseCase.execute();

    console.log(`[CreditReset] Successfully reset credits for ${result.resetCount} workspaces`);
    console.log('[CreditReset] Job completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[CreditReset] Job failed:', error);
    process.exit(1);
  }
}

main();
