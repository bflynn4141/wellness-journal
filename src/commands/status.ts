/**
 * Status Command
 *
 * Shows current configuration and integration status.
 */

import chalk from 'chalk';
import dayjs from 'dayjs';

import { getConfig, checkIntegrations, validateConfig } from '../config.js';
import { initDatabase, getRecentEntries, getHistoricalStats } from '../db/sqlite.js';
import {
  createProgressBar,
  getTrendArrow,
  formatSleepDuration,
} from '../prompts/questions.js';

export async function runStatus(): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan.bold('📊 Wellness Journal Status'));
  console.log(chalk.gray('─'.repeat(50)));

  // Configuration
  const config = getConfig();
  const integrations = checkIntegrations();
  const missing = validateConfig();

  console.log('\n');
  console.log(chalk.bold('Integrations:'));
  console.log(`  Whoop:           ${integrations.whoop ? chalk.green('✓ Connected') : chalk.yellow('○ Not connected')}`);
  console.log(`  Google Calendar: ${integrations.google ? chalk.green('✓ Connected') : chalk.yellow('○ Not connected')}`);
  console.log(`  Claude API:      ${integrations.claude ? chalk.green('✓ Configured') : chalk.gray('○ Optional')}`);

  console.log('\n');
  console.log(chalk.bold('Paths:'));
  console.log(`  Data:     ${chalk.blue(config.dataDir)}`);
  console.log(`  Obsidian: ${chalk.blue(config.obsidianVaultPath)}`);

  if (missing.length > 0) {
    console.log('\n');
    console.log(chalk.yellow('Missing configuration:'));
    missing.forEach((m) => console.log(chalk.yellow(`  • ${m}`)));
  }

  // Database stats
  try {
    initDatabase();
    const entries = getRecentEntries(30);
    const stats = getHistoricalStats(7);

    console.log('\n');
    console.log(chalk.bold('Journal Stats (Last 30 Days):'));
    console.log(`  Entries:    ${entries.length}`);

    if (stats.daysTracked > 0) {
      console.log('\n');
      console.log(chalk.bold('7-Day Averages:'));
      console.log(`  Recovery: ${createProgressBar(stats.avgRecovery)} ${stats.avgRecovery.toFixed(0)}% ${getTrendArrow(stats.recoveryTrend)}`);
      console.log(`  HRV:      ${createProgressBar(stats.avgHrv, 150)} ${stats.avgHrv.toFixed(0)}ms ${getTrendArrow(stats.hrvTrend)}`);
      console.log(`  Sleep:    ${createProgressBar(stats.avgSleep, 480)} ${formatSleepDuration(Math.round(stats.avgSleep))} ${getTrendArrow(stats.sleepTrend)}`);
      console.log(`  Energy:   ${createProgressBar(stats.avgEnergy, 10)} ${stats.avgEnergy.toFixed(1)}/10`);
    }

    // Recent entries
    if (entries.length > 0) {
      console.log('\n');
      console.log(chalk.bold('Recent Entries:'));

      const recentFive = entries.slice(0, 5);
      for (const entry of recentFive) {
        const date = dayjs(entry.date).format('ddd MMM D');
        const recovery = entry.whoopData?.recovery?.score;
        const energy = entry.energyRating;
        const hasEvening = !!entry.evening;

        const recoveryStr = recovery ? `${recovery}%` : '--';
        const energyStr = energy ? `${energy}/10` : '--';
        const eveningStr = hasEvening ? '✓' : '○';

        console.log(
          `  ${chalk.gray(date.padEnd(12))} ` +
          `Recovery: ${recoveryStr.padEnd(5)} ` +
          `Energy: ${energyStr.padEnd(6)} ` +
          `Evening: ${eveningStr}`
        );
      }
    }
  } catch {
    console.log(chalk.gray('\n  No journal data yet. Run `wellness-journal morning` to start!'));
  }

  console.log('\n');
}
