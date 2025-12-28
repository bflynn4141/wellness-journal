/**
 * Weekly Review Command
 *
 * Generates a comprehensive weekly summary with pattern analysis.
 */

import chalk from 'chalk';
import ora from 'ora';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';

import { initDatabase, getRecentEntries, getHistoricalStats } from '../db/sqlite.js';
import { generateWeeklyAnalysis, isClaudeConfigured } from '../integrations/claude.js';
import { saveWeeklyNote } from '../obsidian/generator.js';
import type { DailyEntry } from '../types.js';

dayjs.extend(weekOfYear);

export async function runWeekly(): Promise<void> {
  initDatabase();

  const today = dayjs();
  const weekNum = today.week();
  const year = today.year();

  console.log('\n');
  console.log(chalk.magenta.bold('📊 Weekly Review'));
  console.log(chalk.gray(`Week ${weekNum} of ${year}`));
  console.log(chalk.gray('─'.repeat(50)));

  // Get this week's entries (last 7 days)
  const spinner = ora('Analyzing your week...').start();

  const entries = getRecentEntries(7);
  const stats = getHistoricalStats(7);
  const prevStats = getHistoricalStats(14); // Previous 2 weeks for comparison

  spinner.succeed(`Found ${entries.length} entries this week`);

  if (entries.length === 0) {
    console.log(chalk.yellow('\nNo entries found for this week.'));
    console.log(chalk.gray('Run `wellness-journal morning` to start tracking!'));
    return;
  }

  // Display weekly stats
  displayWeeklyStats(entries, stats, prevStats);

  // Display daily breakdown
  displayDailyBreakdown(entries);

  // Display wins and challenges
  displayReflectionSummary(entries);

  // AI Analysis
  if (isClaudeConfigured() && entries.length >= 3) {
    const aiSpinner = ora('Getting coach analysis...').start();
    try {
      const analysis = await generateWeeklyAnalysis(
        entries.map(e => ({
          date: e.date,
          timestamp: e.timestamp,
          whoopData: e.whoopData,
          calendarData: e.calendarData,
          energyRating: e.energyRating,
          mood: e.mood,
          sleepReflection: e.sleepReflection,
          yesterdayWin: e.yesterdayWin,
          yesterdayChallenge: e.yesterdayChallenge,
          oneThing: e.oneThing,
          movementIntention: e.movementIntention,
          successMetric: e.successMetric,
        })),
        stats
      );
      aiSpinner.succeed('Coach analysis ready');

      console.log('\n');
      console.log(chalk.yellow.bold('🧠 Your Coach\'s Weekly Review'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white(analysis));
    } catch (error) {
      aiSpinner.fail('Could not generate analysis');
    }
  }

  // Generate weekly Obsidian note
  const noteSpinner = ora('Saving weekly note...').start();
  try {
    const notePath = saveWeeklyNote(year, weekNum, entries, stats);
    noteSpinner.succeed(`Weekly note saved: ${chalk.blue(notePath)}`);
  } catch (error) {
    noteSpinner.fail('Could not save weekly note');
  }

  // Streak info
  displayStreakInfo(entries);

  console.log('\n');
  console.log(chalk.magenta.bold('✨ Keep building momentum!'));
  console.log('\n');
}

function displayWeeklyStats(
  entries: DailyEntry[],
  stats: ReturnType<typeof getHistoricalStats>,
  prevStats: ReturnType<typeof getHistoricalStats>
): void {
  console.log('\n');
  console.log(chalk.cyan.bold('📈 This Week\'s Averages'));
  console.log(chalk.gray('─'.repeat(50)));

  const formatChange = (current: number, previous: number, unit: string = ''): string => {
    if (previous === 0) return '';
    const diff = current - previous;
    const arrow = diff > 0 ? chalk.green('↑') : diff < 0 ? chalk.red('↓') : chalk.gray('→');
    return `${arrow} ${Math.abs(diff).toFixed(1)}${unit} vs prev`;
  };

  // Recovery
  const recoveryChange = formatChange(stats.avgRecovery, prevStats.avgRecovery, '%');
  console.log(`  🔋 Recovery:    ${chalk.bold(stats.avgRecovery.toFixed(0) + '%')} ${chalk.gray(recoveryChange)}`);

  // HRV
  const hrvChange = formatChange(stats.avgHrv, prevStats.avgHrv, 'ms');
  console.log(`  ❤️  HRV:         ${chalk.bold(stats.avgHrv.toFixed(0) + 'ms')} ${chalk.gray(hrvChange)}`);

  // Sleep
  const sleepHours = (stats.avgSleep / 60).toFixed(1);
  const prevSleepHours = prevStats.avgSleep / 60;
  const sleepChange = formatChange(stats.avgSleep / 60, prevSleepHours, 'h');
  console.log(`  😴 Sleep:       ${chalk.bold(sleepHours + 'h')} ${chalk.gray(sleepChange)}`);

  // Energy
  const energyChange = formatChange(stats.avgEnergy, prevStats.avgEnergy);
  console.log(`  ⚡ Energy:      ${chalk.bold(stats.avgEnergy.toFixed(1) + '/10')} ${chalk.gray(energyChange)}`);

  // Days tracked
  console.log(`  📅 Days:        ${chalk.bold(entries.length + '/7')} tracked`);
}

function displayDailyBreakdown(entries: DailyEntry[]): void {
  console.log('\n');
  console.log(chalk.cyan.bold('📅 Daily Breakdown'));
  console.log(chalk.gray('─'.repeat(50)));

  // Sort by date
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  for (const entry of sorted) {
    const day = dayjs(entry.date).format('ddd');
    const recovery = entry.whoopData?.recovery?.score ?? '-';
    const sleep = entry.whoopData?.sleep?.qualityDuration
      ? (entry.whoopData.sleep.qualityDuration / 60).toFixed(1) + 'h'
      : '-';
    const energy = entry.energyRating ?? '-';
    const priorityDone = entry.evening?.priorityCompleted;
    const priorityIcon = priorityDone === 'yes' ? '✅' : priorityDone === 'partial' ? '🔶' : priorityDone === 'no' ? '❌' : '⬜';

    console.log(
      `  ${chalk.gray(day)} │ ` +
      `Rec: ${chalk.bold(String(recovery).padStart(3))}% │ ` +
      `Sleep: ${chalk.bold(String(sleep).padStart(5))} │ ` +
      `Energy: ${chalk.bold(String(energy).padStart(2))} │ ` +
      `${priorityIcon}`
    );
  }
}

function displayReflectionSummary(entries: DailyEntry[]): void {
  const wins = entries.filter(e => e.yesterdayWin).map(e => e.yesterdayWin);
  const challenges = entries.filter(e => e.yesterdayChallenge).map(e => e.yesterdayChallenge);
  const priorities = entries.filter(e => e.oneThing).map(e => ({
    priority: e.oneThing,
    completed: e.evening?.priorityCompleted,
  }));

  console.log('\n');
  console.log(chalk.cyan.bold('💭 Week in Review'));
  console.log(chalk.gray('─'.repeat(50)));

  // Wins
  if (wins.length > 0) {
    console.log(chalk.green('  Wins:'));
    wins.slice(0, 3).forEach(w => console.log(chalk.gray(`    • ${w}`)));
  }

  // Challenges
  if (challenges.length > 0) {
    console.log(chalk.yellow('  Challenges:'));
    challenges.slice(0, 3).forEach(c => console.log(chalk.gray(`    • ${c}`)));
  }

  // Priority completion rate
  const completed = priorities.filter(p => p.completed === 'yes').length;
  const partial = priorities.filter(p => p.completed === 'partial').length;
  const total = priorities.filter(p => p.completed).length;

  if (total > 0) {
    const rate = ((completed + partial * 0.5) / total * 100).toFixed(0);
    console.log(`\n  🎯 Priority completion: ${chalk.bold(rate + '%')} (${completed} done, ${partial} partial)`);
  }
}

function displayStreakInfo(entries: DailyEntry[]): void {
  // Calculate current streak
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  let checkDate = dayjs();

  for (let i = 0; i < 30; i++) {
    const dateStr = checkDate.format('YYYY-MM-DD');
    const hasEntry = sorted.some(e => e.date === dateStr);

    if (hasEntry) {
      streak++;
      checkDate = checkDate.subtract(1, 'day');
    } else if (i === 0) {
      // Today might not have an entry yet, that's ok
      checkDate = checkDate.subtract(1, 'day');
    } else {
      break;
    }
  }

  console.log('\n');
  console.log(chalk.cyan.bold('🔥 Streak'));
  console.log(chalk.gray('─'.repeat(50)));

  if (streak === 0) {
    console.log(chalk.yellow('  Start your streak today with `wellness-journal morning`!'));
  } else if (streak < 7) {
    console.log(`  ${chalk.bold(streak)} day${streak > 1 ? 's' : ''} - ${chalk.yellow('Building momentum!')}`);
  } else if (streak < 30) {
    console.log(`  ${chalk.bold(streak)} days - ${chalk.green('On fire! 🔥')}`);
  } else {
    console.log(`  ${chalk.bold(streak)} days - ${chalk.magenta('Legendary! 👑')}`);
  }
}
