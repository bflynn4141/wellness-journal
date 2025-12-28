/**
 * Claude AI Integration
 *
 * Generates personalized wellness insights using Claude as a personal coach.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config.js';
import type { WhoopDailyData, HistoricalStats, CalendarDay, MorningEntry } from '../types.js';

let client: Anthropic | null = null;

const COACH_SYSTEM_PROMPT = `You are a well-rounded personal wellness coach who genuinely cares about the person you're helping. Your role is to:

1. **Analyze data thoughtfully** - Look at the numbers but understand the human behind them
2. **Keep them accountable** - Gently call out patterns that might be holding them back
3. **Motivate authentically** - Celebrate wins, no matter how small, and encourage progress
4. **Be holistic** - Consider physical health, mental wellness, productivity, and life balance
5. **Be direct but warm** - No fluff or generic advice. Be specific and actionable.

You're not just analyzing metrics - you're helping someone become their best self. Push them when they need it, support them when they're struggling, and always be honest.`;

/**
 * Get or create the Anthropic client
 */
function getClient(): Anthropic {
  if (!client) {
    const config = getConfig();
    if (!config.anthropicApiKey) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env');
    }
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/**
 * Check if Claude is configured
 */
export function isClaudeConfigured(): boolean {
  const config = getConfig();
  return !!config.anthropicApiKey;
}

/**
 * Generate morning insights based on Whoop data and history
 */
export async function generateMorningInsights(
  whoopData: WhoopDailyData | null,
  historicalStats: HistoricalStats,
  calendarData: CalendarDay | null
): Promise<string> {
  const anthropic = getClient();

  const prompt = buildMorningPrompt(whoopData, historicalStats, calendarData);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: COACH_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

/**
 * Generate weekly pattern analysis
 */
export async function generateWeeklyAnalysis(
  entries: MorningEntry[],
  historicalStats: HistoricalStats
): Promise<string> {
  const anthropic = getClient();

  const prompt = buildWeeklyPrompt(entries, historicalStats);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: COACH_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

/**
 * Build the morning insight prompt
 */
function buildMorningPrompt(
  whoopData: WhoopDailyData | null,
  stats: HistoricalStats,
  calendar: CalendarDay | null
): string {
  let dataContext = '';

  if (whoopData?.recovery) {
    const recovery = whoopData.recovery;
    const recoveryDiff = recovery.score - stats.avgRecovery;
    const hrvDiff = recovery.hrvRmssd - stats.avgHrv;

    dataContext += `
Recovery: ${recovery.score}% (${recoveryDiff >= 0 ? '+' : ''}${recoveryDiff.toFixed(0)}% vs 7-day avg)
HRV: ${recovery.hrvRmssd.toFixed(0)}ms (${hrvDiff >= 0 ? '+' : ''}${hrvDiff.toFixed(0)}ms vs avg)
Resting HR: ${recovery.restingHeartRate} bpm
`;
  }

  if (whoopData?.sleep) {
    const sleep = whoopData.sleep;
    const sleepHours = (sleep.qualityDuration / 60).toFixed(1);
    const avgSleepHours = (stats.avgSleep / 60).toFixed(1);

    dataContext += `
Sleep: ${sleepHours}h quality (avg: ${avgSleepHours}h)
Sleep efficiency: ${sleep.efficiency.toFixed(0)}%
Deep sleep: ${sleep.stages.deep}min, REM: ${sleep.stages.rem}min
`;
  }

  if (whoopData?.strain) {
    dataContext += `
Yesterday's strain: ${whoopData.strain.score.toFixed(1)}/21
Calories: ${whoopData.strain.calories}
`;
  }

  if (calendar) {
    dataContext += `
Today's calendar: ${calendar.summary.totalEvents} events, ${calendar.summary.meetingMinutes}min in meetings
Longest free block: ${calendar.summary.longestFreeBlock}min
`;
  }

  dataContext += `
Trends (${stats.daysTracked} days tracked):
- Recovery trend: ${stats.recoveryTrend}
- HRV trend: ${stats.hrvTrend}
- Sleep trend: ${stats.sleepTrend}
`;

  return `Here's my morning data. Give me 2-3 brief, personalized insights to start my day right.

${dataContext}

Be specific to MY numbers. What should I know? What should I do differently? Keep it under 100 words but make every word count.`;
}

/**
 * Build the weekly analysis prompt
 */
function buildWeeklyPrompt(entries: MorningEntry[], stats: HistoricalStats): string {
  const summary = entries.map((e) => ({
    date: e.date,
    recovery: e.whoopData?.recovery?.score,
    hrv: e.whoopData?.recovery?.hrvRmssd,
    sleep: e.whoopData?.sleep?.qualityDuration,
    energy: e.energyRating,
    mood: e.mood,
  }));

  return `Here's my week in review. Help me see patterns I might be missing and hold me accountable.

Weekly Data:
${JSON.stringify(summary, null, 2)}

7-Day Averages:
- Recovery: ${stats.avgRecovery.toFixed(0)}%
- HRV: ${stats.avgHrv.toFixed(0)}ms
- Sleep: ${(stats.avgSleep / 60).toFixed(1)}h
- Energy: ${stats.avgEnergy.toFixed(1)}/10

Trends: Recovery ${stats.recoveryTrend}, HRV ${stats.hrvTrend}, Sleep ${stats.sleepTrend}

Give me:
1. The most important pattern you see
2. Something I should be proud of OR something I need to address
3. One specific thing to focus on next week

Be honest with me. Keep it under 150 words.`;
}
