/**
 * Obsidian Markdown Generator
 *
 * Generates beautiful daily notes in Obsidian format from journal entries.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import dayjs from 'dayjs';

import { getDailyNotePath } from '../config.js';
import { getDailyEntry, getHistoricalStats } from '../db/sqlite.js';
import { formatTime, formatDuration } from '../integrations/calendar.js';
import {
  MOOD_OPTIONS,
  MOVEMENT_OPTIONS,
  getRecoveryCategory,
  getTrendArrow,
  formatSleepDuration,
  createProgressBar,
} from '../prompts/questions.js';
import type { DailyEntry, HistoricalStats } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Register Handlebars helpers
Handlebars.registerHelper('formatTime', formatTime);
Handlebars.registerHelper('formatDuration', (minutes: number) => formatDuration(minutes));
Handlebars.registerHelper('formatSleep', (minutes: number) => formatSleepDuration(minutes));
Handlebars.registerHelper('progressBar', (value: number, max: number) => createProgressBar(value, max));
Handlebars.registerHelper('trendArrow', (trend: string) => getTrendArrow(trend as 'up' | 'down' | 'stable'));
Handlebars.registerHelper('recoveryEmoji', (score: number) => getRecoveryCategory(score).emoji);
Handlebars.registerHelper('moodLabel', (mood: string) => {
  const option = MOOD_OPTIONS.find((m) => m.value === mood);
  return option ? `${option.emoji} ${option.label}` : mood;
});
Handlebars.registerHelper('movementLabel', (movement: string) => {
  const option = MOVEMENT_OPTIONS.find((m) => m.value === movement);
  return option ? option.label : movement;
});
Handlebars.registerHelper('dateFormat', (date: string, format: string) => dayjs(date).format(format));
Handlebars.registerHelper('ifEquals', function (this: unknown, arg1: unknown, arg2: unknown, options: Handlebars.HelperOptions) {
  return arg1 === arg2 ? options.fn(this) : options.inverse(this);
});
Handlebars.registerHelper('round', (value: number, decimals: number = 0) => {
  if (typeof value !== 'number') return value;
  return decimals === 0 ? Math.round(value) : value.toFixed(decimals);
});

/**
 * Get the daily note template
 */
function getTemplate(): Handlebars.TemplateDelegate {
  // First try to load from templates directory
  const templatePaths = [
    join(__dirname, '../../templates/daily.hbs'),
    join(__dirname, '../templates/daily.hbs'),
  ];

  for (const templatePath of templatePaths) {
    if (existsSync(templatePath)) {
      const templateSource = readFileSync(templatePath, 'utf-8');
      return Handlebars.compile(templateSource);
    }
  }

  // Fall back to inline template
  return Handlebars.compile(DEFAULT_TEMPLATE);
}

/**
 * Generate an Obsidian daily note for a specific date
 */
export function generateDailyNote(date: string): string {
  const entry = getDailyEntry(date);
  const stats = getHistoricalStats(7);

  const template = getTemplate();
  const context = buildTemplateContext(date, entry, stats);

  return template(context);
}

/**
 * Save a daily note to the Obsidian vault
 */
export function saveDailyNote(date: string): string {
  const notePath = getDailyNotePath(date);

  // Ensure directory exists
  const noteDir = dirname(notePath);
  if (!existsSync(noteDir)) {
    mkdirSync(noteDir, { recursive: true });
  }

  // Generate and save
  const content = generateDailyNote(date);
  writeFileSync(notePath, content, 'utf-8');

  return notePath;
}

/**
 * Build the template context from entry data
 */
function buildTemplateContext(
  date: string,
  entry: DailyEntry | null,
  stats: HistoricalStats
): Record<string, unknown> {
  const dayObj = dayjs(date);
  const yesterday = dayObj.subtract(1, 'day').format('YYYY-MM-DD');
  const tomorrow = dayObj.add(1, 'day').format('YYYY-MM-DD');
  const weekNumber = dayObj.format('YYYY-[W]WW');

  const context: Record<string, unknown> = {
    // Date info
    date,
    dateFormatted: dayObj.format('dddd, MMMM D, YYYY'),
    dayOfWeek: dayObj.format('dddd'),
    yesterday,
    tomorrow,
    weekNumber,

    // Historical stats
    stats: {
      avgRecovery: stats.avgRecovery,
      avgHrv: stats.avgHrv,
      avgSleep: stats.avgSleep,
      avgEnergy: stats.avgEnergy,
      recoveryTrend: stats.recoveryTrend,
      hrvTrend: stats.hrvTrend,
      sleepTrend: stats.sleepTrend,
      daysTracked: stats.daysTracked,
    },

    // Default empty values
    hasEntry: !!entry,
    hasMorning: !!entry,
    hasEvening: !!entry?.evening,
    hasWhoop: false,
    hasCalendar: false,
  };

  if (!entry) {
    return context;
  }

  // Whoop data
  if (entry.whoopData) {
    context.hasWhoop = true;
    context.whoop = {
      date: entry.whoopData.date,
      hasRecovery: !!entry.whoopData.recovery,
      hasSleep: !!entry.whoopData.sleep,
      hasStrain: !!entry.whoopData.strain,
    };

    if (entry.whoopData.recovery) {
      const recovery = entry.whoopData.recovery;
      const category = getRecoveryCategory(recovery.score);
      Object.assign(context.whoop as object, {
        recovery: {
          score: recovery.score,
          category: category.label,
          emoji: category.emoji,
          hrv: recovery.hrvRmssd,
          rhr: recovery.restingHeartRate,
        },
      });
    }

    if (entry.whoopData.sleep) {
      const sleep = entry.whoopData.sleep;
      Object.assign(context.whoop as object, {
        sleep: {
          qualityMinutes: sleep.qualityDuration,
          qualityFormatted: formatSleepDuration(sleep.qualityDuration),
          totalMinutes: sleep.totalInBedDuration,
          efficiency: sleep.efficiency,
          consistency: sleep.consistencyScore,
          stages: sleep.stages,
        },
      });
    }

    if (entry.whoopData.strain) {
      const strain = entry.whoopData.strain;
      Object.assign(context.whoop as object, {
        strain: {
          score: strain.score,
          avgHr: strain.averageHeartRate,
          maxHr: strain.maxHeartRate,
          calories: strain.calories,
          workouts: strain.workouts,
          hasWorkouts: strain.workouts.length > 0,
          workoutList: strain.workouts.map((w) => w.sport).join(', '),
        },
      });
    }
  }

  // Calendar data
  if (entry.calendarData) {
    context.hasCalendar = true;
    context.calendar = {
      events: entry.calendarData.events.map((e) => ({
        ...e,
        startFormatted: formatTime(e.startTime),
        durationFormatted: formatDuration(e.duration),
        typeEmoji: e.type === 'meeting' ? '👥' : e.type === 'focus' ? '🎯' : '📌',
      })),
      summary: entry.calendarData.summary,
      freeBlockFormatted: formatDuration(entry.calendarData.summary.longestFreeBlock),
      meetingTimeFormatted: formatDuration(entry.calendarData.summary.meetingMinutes),
    };
  }

  // Morning entry data
  context.morning = {
    energyRating: entry.energyRating,
    mood: entry.mood,
    moodFormatted: MOOD_OPTIONS.find((m) => m.value === entry.mood)?.label || entry.mood,
    moodEmoji: MOOD_OPTIONS.find((m) => m.value === entry.mood)?.emoji || '',
    sleepReflection: entry.sleepReflection,
    yesterdayWin: entry.yesterdayWin,
    yesterdayChallenge: entry.yesterdayChallenge,
    oneThing: entry.oneThing,
    movementIntention: entry.movementIntention,
    movementFormatted: MOVEMENT_OPTIONS.find((m) => m.value === entry.movementIntention)?.label || entry.movementIntention,
    successMetric: entry.successMetric,
    patterns: entry.patterns,
    dynamicQuestions: entry.dynamicQuestions,
  };

  // Evening entry data
  if (entry.evening) {
    context.evening = {
      priorityCompleted: entry.evening.priorityCompleted,
      priorityEmoji: entry.evening.priorityCompleted === 'yes' ? '✅' : entry.evening.priorityCompleted === 'partial' ? '🔶' : '❌',
      eveningReflection: entry.evening.eveningReflection,
      gratitude: entry.evening.gratitude,
      tomorrowRemember: entry.evening.tomorrowRemember,
    };
  }

  return context;
}

// ============================================================================
// Default Template (fallback if no template file)
// ============================================================================

const DEFAULT_TEMPLATE = `---
date: {{date}}
type: daily-journal
{{#if hasWhoop}}
{{#if whoop.hasRecovery}}
recovery_score: {{whoop.recovery.score}}
hrv: {{whoop.recovery.hrv}}
rhr: {{whoop.recovery.rhr}}
{{/if}}
{{#if whoop.hasSleep}}
sleep_minutes: {{whoop.sleep.qualityMinutes}}
sleep_efficiency: {{whoop.sleep.efficiency}}
{{/if}}
{{#if whoop.hasStrain}}
strain: {{whoop.strain.score}}
{{/if}}
{{/if}}
{{#if hasMorning}}
energy_rating: {{morning.energyRating}}
mood: {{morning.mood}}
{{/if}}
tags: [daily, journal, wellness]
---

# {{dateFormatted}}

## 🌅 Morning Check-in

{{#if hasWhoop}}
### Body Data

| Metric | Value | 7-Day Avg | Trend |
|--------|-------|-----------|-------|
{{#if whoop.hasRecovery}}
| {{whoop.recovery.emoji}} Recovery | **{{whoop.recovery.score}}%** | {{round stats.avgRecovery}}% | {{trendArrow stats.recoveryTrend}} |
| ❤️ HRV | **{{round whoop.recovery.hrv}}ms** | {{round stats.avgHrv}}ms | {{trendArrow stats.hrvTrend}} |
| 💓 RHR | **{{whoop.recovery.rhr}} bpm** | - | - |
{{/if}}
{{#if whoop.hasSleep}}
| 😴 Sleep | **{{whoop.sleep.qualityFormatted}}** | {{formatSleep stats.avgSleep}} | {{trendArrow stats.sleepTrend}} |
{{/if}}
{{#if whoop.hasStrain}}
| 🔥 Strain | **{{round whoop.strain.score 1}}/21** | - | - |
{{/if}}

{{#if whoop.hasSleep}}
**Sleep Details:** {{whoop.sleep.efficiency}}% efficiency | Deep: {{whoop.sleep.stages.deep}}m | REM: {{whoop.sleep.stages.rem}}m | Light: {{whoop.sleep.stages.light}}m
{{/if}}

{{#if whoop.strain.hasWorkouts}}
**Activities:** {{whoop.strain.workoutList}}
{{/if}}
{{else}}
*No Whoop data available*
{{/if}}

---

## 🪞 Reflection

### How I'm Feeling
- **Energy (1-10):** {{morning.energyRating}}
- **Mood:** {{morning.moodEmoji}} {{morning.moodFormatted}}
- **Sleep Quality (subjective):** {{morning.sleepReflection}}

### Yesterday
**What went well:**
{{morning.yesterdayWin}}

**What was challenging:**
{{morning.yesterdayChallenge}}

{{#if morning.dynamicQuestions}}
### Dynamic Reflections
{{#each morning.dynamicQuestions}}
{{{this}}}

{{/each}}
{{/if}}

---

## 🎯 Intentions

### Today's Priority
> {{morning.oneThing}}

### Movement Plan
{{#if hasWhoop}}Based on my {{whoop.recovery.score}}% recovery: {{/if}}**{{morning.movementFormatted}}**

### What Would Make Today a Win
{{morning.successMetric}}

---

{{#if hasCalendar}}
## 📅 Today's Schedule

| Time | Event | Duration |
|------|-------|----------|
{{#each calendar.events}}
| {{startFormatted}} | {{typeEmoji}} {{title}} | {{durationFormatted}} |
{{/each}}

**Summary:** {{calendar.summary.totalEvents}} events | {{calendar.meetingTimeFormatted}} in meetings | {{calendar.freeBlockFormatted}} longest free block
{{/if}}

---

## 📓 Evening Reflection

{{#if hasEvening}}
### Did I accomplish my #1 priority?
{{evening.priorityEmoji}} **{{evening.priorityCompleted}}**

### What actually happened today
{{evening.eveningReflection}}

### Gratitude
{{#each evening.gratitude}}
{{@index}}. {{this}}
{{/each}}

### Tomorrow I want to remember
{{evening.tomorrowRemember}}
{{else}}
<!-- Fill this in tonight -->

### Did I accomplish my #1 priority?
- [ ] Yes
- [ ] Partially
- [ ] No

### What actually happened today


### Gratitude
1.
2.
3.

### Tomorrow I want to remember

{{/if}}

---

## 🔗 Links
- [[{{yesterday}}|← Yesterday]]
- [[{{tomorrow}}|Tomorrow →]]
- [[{{weekNumber}}|This Week]]
`;
