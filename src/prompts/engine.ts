/**
 * CLI Prompt Engine
 *
 * Handles the interactive morning routine flow using Inquirer.
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import dayjs from 'dayjs';

import {
  MOOD_OPTIONS,
  MOVEMENT_OPTIONS,
  PRIORITY_OPTIONS,
  generateDynamicQuestions,
  getRecoveryCategory,
  getTrendArrow,
  formatSleepDuration,
  createProgressBar,
  getSuggestedMovement,
} from './questions.js';
import { getWhoopDailyData, isWhoopAuthenticated } from '../integrations/whoop.js';
import { getCalendarEvents, isGoogleAuthenticated, formatTime, formatDuration } from '../integrations/calendar.js';
import { generateMorningInsights, isClaudeConfigured } from '../integrations/claude.js';
import { getHistoricalStats, saveMorningEntry, saveEveningEntry, getDailyEntry, getActiveHabits, logHabit } from '../db/sqlite.js';
import type { MorningEntry, EveningEntry, WhoopDailyData, CalendarDay, HistoricalStats } from '../types.js';

// ============================================================================
// Morning Routine
// ============================================================================

export async function runMorningRoutine(): Promise<void> {
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const dayOfWeek = dayjs().day();

  console.log('\n');
  console.log(chalk.cyan.bold('🌅 Good morning! Let\'s check in.'));
  console.log(chalk.gray('─'.repeat(50)));

  // Check for existing entry
  const existingEntry = getDailyEntry(today);
  if (existingEntry) {
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'You already have an entry for today. Update it?',
        default: false,
      },
    ]);

    if (!overwrite) {
      // Show a summary of what they entered
      console.log('\n');
      console.log(chalk.cyan.bold('📝 Today\'s Entry'));
      console.log(chalk.gray('─'.repeat(50)));

      if (existingEntry.whoopData?.recovery) {
        console.log(`  🔋 Recovery: ${existingEntry.whoopData.recovery.score}%`);
      }
      console.log(`  ⚡ Energy: ${existingEntry.energyRating}/10`);
      console.log(`  🎭 Mood: ${existingEntry.mood.replace('_', ' ')}`);

      console.log('\n');
      console.log(chalk.cyan.bold('🎯 Your Priority'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`  "${existingEntry.oneThing}"`);
      console.log(chalk.gray(`  Success: ${existingEntry.successMetric}`));

      if (existingEntry.evening) {
        console.log('\n');
        console.log(chalk.green.bold('✓ Evening check-in complete'));
        const status = existingEntry.evening.priorityCompleted === 'yes' ? '✅ Done' :
                       existingEntry.evening.priorityCompleted === 'partial' ? '🔶 Partial' : '❌ No';
        console.log(`  Priority: ${status}`);
      } else {
        console.log('\n');
        console.log(chalk.yellow('○ Evening check-in pending'));
        console.log(chalk.gray('  Run `wellness-journal evening` later to reflect'));
      }

      console.log('\n');
      console.log(chalk.gray('Have a great day! 🌟'));
      return;
    }
  }

  // Fetch data
  const spinner = ora('Fetching your data...').start();

  let whoopData: WhoopDailyData | null = null;
  let calendarData: CalendarDay | null = null;
  let historicalStats: HistoricalStats = {
    avgRecovery: 0,
    avgHrv: 0,
    avgSleep: 0,
    avgEnergy: 0,
    recoveryTrend: 'stable',
    hrvTrend: 'stable',
    sleepTrend: 'stable',
    daysTracked: 0,
  };

  try {
    // Fetch data from services
    const [fetchedWhoopData, fetchedCalendarData] = await Promise.all([
      isWhoopAuthenticated() ? getWhoopDailyData(yesterday) : Promise.resolve(null),
      isGoogleAuthenticated() ? getCalendarEvents(today) : Promise.resolve(null),
    ]);

    whoopData = fetchedWhoopData;
    calendarData = fetchedCalendarData;

    // Always get historical stats from local DB
    historicalStats = getHistoricalStats(7);

    spinner.succeed('Data loaded');
  } catch (error) {
    spinner.fail('Some data could not be loaded');
    console.log(chalk.yellow(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
  }

  // Display yesterday's data
  displayYesterdayData(whoopData, historicalStats);

  // Display today's calendar
  if (calendarData) {
    displayTodayCalendar(calendarData);
  }

  // Generate AI insights if Claude is configured
  if (isClaudeConfigured() && (whoopData || calendarData)) {
    const insightSpinner = ora('Getting personalized insights...').start();
    try {
      const insights = await generateMorningInsights(whoopData, historicalStats, calendarData);
      insightSpinner.succeed('Coach insights ready');

      console.log('\n');
      console.log(chalk.yellow.bold('🧠 Your Coach Says'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white(insights));
    } catch (error) {
      insightSpinner.fail('Could not generate insights');
      console.log(chalk.gray(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  // Generate dynamic questions
  const dynamicQuestions = generateDynamicQuestions(whoopData, historicalStats, dayOfWeek);

  console.log('\n');
  console.log(chalk.cyan.bold('🪞 Reflection'));
  console.log(chalk.gray('─'.repeat(50)));

  // Core questions
  const answers = await inquirer.prompt<{
    energyRating: number;
    mood: string;
    sleepReflection: string;
    yesterdayWin: string;
    yesterdayChallenge: string;
    dynamicAnswers: string[];
  }>([
    {
      type: 'number',
      name: 'energyRating',
      message: 'How\'s your energy right now? (1-10)',
      validate: (value: number) => {
        if (value >= 1 && value <= 10) return true;
        return 'Please enter a number between 1 and 10';
      },
    },
    {
      type: 'list',
      name: 'mood',
      message: 'What\'s your emotional baseline today?',
      choices: MOOD_OPTIONS.map((m) => ({
        name: `${m.emoji} ${m.label}`,
        value: m.value,
      })),
    },
    {
      type: 'input',
      name: 'sleepReflection',
      message: 'How do you feel about last night\'s sleep?',
    },
    {
      type: 'input',
      name: 'yesterdayWin',
      message: 'What went well yesterday?',
    },
    {
      type: 'input',
      name: 'yesterdayChallenge',
      message: 'What was challenging?',
    },
  ]);

  // Ask dynamic questions if any
  const dynamicAnswers: string[] = [];
  for (const dq of dynamicQuestions) {
    console.log(chalk.gray(`\n  💡 ${dq.context}`));
    const { answer } = await inquirer.prompt<{ answer: string }>([
      {
        type: 'input',
        name: 'answer',
        message: dq.question,
      },
    ]);
    dynamicAnswers.push(`Q: ${dq.question}\nA: ${answer}`);
  }

  // Check if yesterday's habits were logged (evening check-in)
  const yesterdayEntry = getDailyEntry(yesterday);
  const yesterdayHabitsLogged = yesterdayEntry?.evening?.eveningHabits &&
    yesterdayEntry.evening.eveningHabits.length > 0;

  if (!yesterdayHabitsLogged) {
    // Get evening/anytime habits to ask about yesterday
    const eveningHabits = getActiveHabits('evening');

    if (eveningHabits.length > 0) {
      console.log('\n');
      console.log(chalk.yellow.bold('📋 Yesterday\'s Habits'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.gray('(You didn\'t log these last night - let\'s catch up!)'));

      const { habitsDone } = await inquirer.prompt<{ habitsDone: number[] }>([
        {
          type: 'checkbox',
          name: 'habitsDone',
          message: 'Which habits did you complete yesterday?',
          choices: eveningHabits.map((h) => ({
            name: `${h.emoji} ${h.name}`,
            value: h.id,
          })),
        },
      ]);

      // Log yesterday's habits
      for (const habit of eveningHabits) {
        logHabit(yesterday, habit.id, habitsDone.includes(habit.id));
      }

      const completedCount = habitsDone.length;
      console.log(chalk.gray(`  ✓ Logged ${completedCount}/${eveningHabits.length} habits for yesterday`));
    }
  }

  console.log('\n');
  console.log(chalk.cyan.bold('🎯 Intentions'));
  console.log(chalk.gray('─'.repeat(50)));

  // Get suggested movement based on recovery
  const recoveryScore = whoopData?.recovery?.score;
  const suggestedMovement = recoveryScore
    ? getSuggestedMovement(recoveryScore)
    : 'light_workout';

  const intentions = await inquirer.prompt<{
    oneThing: string;
    movementIntention: string;
    successMetric: string;
  }>([
    {
      type: 'input',
      name: 'oneThing',
      message: 'What\'s the ONE thing that matters most today?',
    },
    {
      type: 'list',
      name: 'movementIntention',
      message: `Based on your ${recoveryScore ?? 'unknown'}% recovery, how will you move today?`,
      choices: MOVEMENT_OPTIONS.map((m) => ({
        name: `${m.value === suggestedMovement ? '★ ' : '  '}${m.label} - ${m.description}`,
        value: m.value,
      })),
      default: suggestedMovement,
    },
    {
      type: 'input',
      name: 'successMetric',
      message: 'What would make today a win?',
    },
  ]);

  // Morning habit check-in
  const morningHabits = getActiveHabits('morning');
  let completedMorningHabits: Array<{ habitId: number; completed: boolean }> = [];

  if (morningHabits.length > 0) {
    console.log('\n');
    console.log(chalk.cyan.bold('🌅 Morning Habits'));
    console.log(chalk.gray('─'.repeat(50)));

    const { habitsDone } = await inquirer.prompt<{ habitsDone: number[] }>([
      {
        type: 'checkbox',
        name: 'habitsDone',
        message: 'Which morning habits did you complete?',
        choices: morningHabits.map((h) => ({
          name: `${h.emoji} ${h.name}`,
          value: h.id,
        })),
      },
    ]);

    // Log all morning habits
    completedMorningHabits = morningHabits.map((h) => ({
      habitId: h.id,
      completed: habitsDone.includes(h.id),
    }));

    for (const habit of morningHabits) {
      logHabit(today, habit.id, habitsDone.includes(habit.id));
    }
  }

  // Create and save entry
  const entry: MorningEntry = {
    date: today,
    timestamp: new Date().toISOString(),
    whoopData,
    calendarData,
    energyRating: answers.energyRating,
    mood: answers.mood as MorningEntry['mood'],
    sleepReflection: answers.sleepReflection,
    yesterdayWin: answers.yesterdayWin,
    yesterdayChallenge: answers.yesterdayChallenge,
    oneThing: intentions.oneThing,
    movementIntention: intentions.movementIntention as MorningEntry['movementIntention'],
    successMetric: intentions.successMetric,
    morningHabits: completedMorningHabits.length > 0 ? completedMorningHabits : undefined,
    dynamicQuestions: dynamicAnswers.length > 0 ? dynamicAnswers : undefined,
  };

  const saveSpinner = ora('Saving entry...').start();
  try {
    saveMorningEntry(entry);
    saveSpinner.succeed('Entry saved to database');
  } catch (error) {
    saveSpinner.fail('Failed to save entry');
    console.error(error);
  }

  console.log('\n');
  console.log(chalk.green.bold('✨ You\'re all set! Have a great day.'));
  console.log(chalk.gray(`\nYour priority: ${chalk.white(intentions.oneThing)}`));
  console.log(chalk.gray(`Success looks like: ${chalk.white(intentions.successMetric)}`));
  console.log('\n');

  return;
}

// ============================================================================
// Evening Routine
// ============================================================================

export async function runEveningRoutine(): Promise<void> {
  const today = dayjs().format('YYYY-MM-DD');

  console.log('\n');
  console.log(chalk.magenta.bold('🌙 Evening Check-in'));
  console.log(chalk.gray('─'.repeat(50)));

  // Check for morning entry
  const morningEntry = getDailyEntry(today);
  if (!morningEntry) {
    console.log(chalk.yellow('No morning entry found for today. Run `wellness-journal morning` first.'));
    return;
  }

  if (morningEntry.evening) {
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'You already completed the evening check-in. Update it?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('Keeping existing entry. Good night!'));
      return;
    }
  }

  // Remind of morning intention
  console.log(chalk.gray(`\nThis morning, your priority was:`));
  console.log(chalk.white.bold(`  "${morningEntry.oneThing}"`));
  console.log(chalk.gray(`\nSuccess looked like:`));
  console.log(chalk.white(`  "${morningEntry.successMetric}"`));
  console.log('');

  const answers = await inquirer.prompt<{
    priorityCompleted: string;
    eveningReflection: string;
    gratitude1: string;
    gratitude2: string;
    gratitude3: string;
    tomorrowRemember: string;
  }>([
    {
      type: 'list',
      name: 'priorityCompleted',
      message: 'Did you accomplish your #1 priority?',
      choices: PRIORITY_OPTIONS,
    },
    {
      type: 'input',
      name: 'eveningReflection',
      message: 'What actually happened today?',
    },
    {
      type: 'input',
      name: 'gratitude1',
      message: 'Gratitude #1: What are you thankful for?',
    },
    {
      type: 'input',
      name: 'gratitude2',
      message: 'Gratitude #2:',
    },
    {
      type: 'input',
      name: 'gratitude3',
      message: 'Gratitude #3:',
    },
    {
      type: 'input',
      name: 'tomorrowRemember',
      message: 'What do you want to remember for tomorrow?',
    },
  ]);

  // Evening habit check-in
  const eveningHabits = getActiveHabits('evening');
  let completedEveningHabits: Array<{ habitId: number; completed: boolean }> = [];

  if (eveningHabits.length > 0) {
    console.log('\n');
    console.log(chalk.magenta.bold('🌙 Today\'s Habits'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray('Check off the habits you completed today:'));

    const { habitsDone } = await inquirer.prompt<{ habitsDone: number[] }>([
      {
        type: 'checkbox',
        name: 'habitsDone',
        message: 'Which habits did you complete today?',
        choices: eveningHabits.map((h) => ({
          name: `${h.emoji} ${h.name}`,
          value: h.id,
        })),
      },
    ]);

    // Log all evening habits
    completedEveningHabits = eveningHabits.map((h) => ({
      habitId: h.id,
      completed: habitsDone.includes(h.id),
    }));

    for (const habit of eveningHabits) {
      logHabit(today, habit.id, habitsDone.includes(habit.id));
    }

    // Show completion summary
    const completedCount = habitsDone.length;
    const totalCount = eveningHabits.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    console.log('\n');
    console.log(chalk.gray(`  Today's score: ${chalk.bold(completedCount + '/' + totalCount)} habits (${percentage}%)`));
  }

  const entry: EveningEntry = {
    date: today,
    timestamp: new Date().toISOString(),
    priorityCompleted: answers.priorityCompleted as EveningEntry['priorityCompleted'],
    eveningReflection: answers.eveningReflection,
    gratitude: [answers.gratitude1, answers.gratitude2, answers.gratitude3].filter(Boolean),
    tomorrowRemember: answers.tomorrowRemember,
    eveningHabits: completedEveningHabits.length > 0 ? completedEveningHabits : undefined,
  };

  const saveSpinner = ora('Saving entry...').start();
  try {
    saveEveningEntry(entry);
    saveSpinner.succeed('Evening entry saved');
  } catch (error) {
    saveSpinner.fail('Failed to save entry');
    console.error(error);
  }

  console.log('\n');
  console.log(chalk.magenta.bold('🌟 Great reflection! Sleep well.'));
  console.log('\n');
}

// ============================================================================
// Display Helpers
// ============================================================================

function displayYesterdayData(whoopData: WhoopDailyData | null, stats: HistoricalStats): void {
  console.log('\n');
  console.log(chalk.cyan.bold('📊 Yesterday\'s Data'));
  console.log(chalk.gray('─'.repeat(50)));

  if (!whoopData || (!whoopData.recovery && !whoopData.sleep && !whoopData.strain)) {
    console.log(chalk.gray('  No Whoop data available for yesterday'));
    console.log(chalk.gray('  (Data syncs a few hours after waking - check back later)'));
    return;
  }

  // Recovery
  if (whoopData.recovery) {
    const recovery = whoopData.recovery.score;
    const category = getRecoveryCategory(recovery);
    const trend = getTrendArrow(stats.recoveryTrend);
    const avgRecovery = stats.avgRecovery.toFixed(0);

    console.log(
      `  ${category.emoji} Recovery:  ${createProgressBar(recovery)} ${chalk.bold(recovery + '%')} ` +
      chalk.gray(`(${trend} vs ${avgRecovery}% avg)`)
    );

    const hrv = whoopData.recovery.hrvRmssd;
    const hrvTrend = getTrendArrow(stats.hrvTrend);
    const avgHrv = stats.avgHrv.toFixed(0);
    console.log(
      `  ❤️  HRV:       ${createProgressBar(hrv, 150)} ${chalk.bold(hrv.toFixed(0) + 'ms')} ` +
      chalk.gray(`(${hrvTrend} vs ${avgHrv}ms avg)`)
    );

    console.log(
      `  💓 RHR:       ${chalk.bold(whoopData.recovery.restingHeartRate)} bpm`
    );
  }

  // Sleep
  if (whoopData.sleep) {
    const sleepDuration = formatSleepDuration(whoopData.sleep.qualityDuration);
    const sleepTrend = getTrendArrow(stats.sleepTrend);
    const avgSleep = formatSleepDuration(Math.round(stats.avgSleep));

    console.log(
      `  😴 Sleep:     ${createProgressBar(whoopData.sleep.qualityDuration, 480)} ${chalk.bold(sleepDuration)} ` +
      chalk.gray(`(${sleepTrend} vs ${avgSleep} avg)`)
    );
    console.log(
      `     Efficiency: ${chalk.bold(whoopData.sleep.efficiency.toFixed(0) + '%')} | ` +
      `Deep: ${whoopData.sleep.stages.deep}m | REM: ${whoopData.sleep.stages.rem}m`
    );
  }

  // Strain
  if (whoopData.strain) {
    console.log(
      `  🔥 Strain:    ${createProgressBar(whoopData.strain.score, 21)} ${chalk.bold(whoopData.strain.score.toFixed(1) + '/21')}`
    );

    if (whoopData.strain.workouts.length > 0) {
      const workouts = whoopData.strain.workouts.map((w) => w.sport).join(', ');
      console.log(chalk.gray(`     Activities: ${workouts}`));
    }
  }
}

function displayTodayCalendar(calendarData: CalendarDay): void {
  console.log('\n');
  console.log(chalk.cyan.bold('📅 Today\'s Schedule'));
  console.log(chalk.gray('─'.repeat(50)));

  if (calendarData.events.length === 0) {
    console.log(chalk.green('  ✨ Your calendar is clear today!'));
    return;
  }

  // Show first 6 events
  const displayEvents = calendarData.events.slice(0, 6);
  for (const event of displayEvents) {
    const time = formatTime(event.startTime);
    const duration = formatDuration(event.duration);
    const typeEmoji = event.type === 'meeting' ? '👥' : event.type === 'focus' ? '🎯' : '📌';

    console.log(`  ${chalk.gray(time.padEnd(10))} ${typeEmoji} ${event.title} ${chalk.gray(`(${duration})`)}`);
  }

  if (calendarData.events.length > 6) {
    console.log(chalk.gray(`  ... and ${calendarData.events.length - 6} more events`));
  }

  // Summary
  console.log('');
  console.log(chalk.gray(
    `  📊 ${calendarData.summary.totalEvents} events | ` +
    `${formatDuration(calendarData.summary.meetingMinutes)} in meetings | ` +
    `${formatDuration(calendarData.summary.longestFreeBlock)} longest free block`
  ));
}
