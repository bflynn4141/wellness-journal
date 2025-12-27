/**
 * Core question definitions for the wellness journal
 *
 * These questions are asked consistently to build longitudinal data.
 * The structure enables pattern analysis over time.
 */

import type { MoodOption, MovementIntention, WhoopDailyData, HistoricalStats } from '../types.js';

// ============================================================================
// Question Definitions
// ============================================================================

export const MOOD_OPTIONS: Array<{ value: MoodOption; label: string; emoji: string }> = [
  { value: 'calm_focused', label: 'Calm & Focused', emoji: '😌' },
  { value: 'energized', label: 'Energized', emoji: '⚡' },
  { value: 'tired_okay', label: 'Tired but Okay', emoji: '😴' },
  { value: 'anxious_stressed', label: 'Anxious / Stressed', emoji: '😰' },
  { value: 'low_flat', label: 'Low / Flat', emoji: '😔' },
];

export const MOVEMENT_OPTIONS: Array<{ value: MovementIntention; label: string; description: string }> = [
  { value: 'rest', label: 'Rest Day', description: 'No structured exercise, prioritize recovery' },
  { value: 'active_recovery', label: 'Active Recovery', description: 'Light movement: walk, yoga, stretching' },
  { value: 'light_workout', label: 'Light Workout', description: 'Easy to moderate intensity exercise' },
  { value: 'full_intensity', label: 'Full Intensity', description: 'High intensity training or competition' },
];

export const PRIORITY_OPTIONS = [
  { value: 'yes', label: 'Yes ✅' },
  { value: 'partial', label: 'Partially 🔶' },
  { value: 'no', label: 'No ❌' },
];

// ============================================================================
// Dynamic Question Generation
// ============================================================================

export interface DynamicQuestion {
  question: string;
  context: string;
  priority: number; // Higher = more important
}

/**
 * Generate dynamic questions based on current data and patterns
 */
export function generateDynamicQuestions(
  whoopData: WhoopDailyData | null,
  historicalStats: HistoricalStats,
  dayOfWeek: number // 0 = Sunday, 6 = Saturday
): DynamicQuestion[] {
  const questions: DynamicQuestion[] = [];

  // Recovery-based questions
  if (whoopData?.recovery) {
    const recovery = whoopData.recovery.score;

    if (recovery < 33) {
      questions.push({
        question: "Your recovery is in the red today. What might have contributed to this?",
        context: `Recovery: ${recovery}%`,
        priority: 10,
      });
      questions.push({
        question: "How will you modify your plans to support your body today?",
        context: 'Low recovery day',
        priority: 9,
      });
    } else if (recovery > 80) {
      questions.push({
        question: "You're in the green! How do you want to capitalize on this energy?",
        context: `Recovery: ${recovery}%`,
        priority: 7,
      });
    }
  }

  // HRV trend questions
  if (historicalStats.hrvTrend === 'down' && historicalStats.daysTracked >= 5) {
    questions.push({
      question: "Your HRV has been trending down. What's been weighing on you lately?",
      context: 'Declining HRV trend over several days',
      priority: 8,
    });
  }

  // Sleep-based questions
  if (whoopData?.sleep) {
    const sleepHours = whoopData.sleep.qualityDuration / 60;

    if (sleepHours < 6) {
      questions.push({
        question: "You got less than 6 hours of quality sleep. What kept you up?",
        context: `Sleep: ${sleepHours.toFixed(1)} hours`,
        priority: 8,
      });
    }

    if (whoopData.sleep.efficiency < 80) {
      questions.push({
        question: "Your sleep efficiency was lower than usual. Anything disrupting your sleep?",
        context: `Efficiency: ${whoopData.sleep.efficiency}%`,
        priority: 6,
      });
    }
  }

  // Weekend questions
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    questions.push({
      question: "It's the weekend. What does rest and recharge look like for you today?",
      context: 'Weekend check-in',
      priority: 5,
    });
  }

  // Monday question
  if (dayOfWeek === 1) {
    questions.push({
      question: "It's Monday. What's the most important outcome for this week?",
      context: 'Week planning',
      priority: 6,
    });
  }

  // Friday question
  if (dayOfWeek === 5) {
    questions.push({
      question: "It's Friday. What are you proud of accomplishing this week?",
      context: 'Week reflection',
      priority: 5,
    });
  }

  // High strain follow-up
  if (whoopData?.strain && whoopData.strain.score > 15) {
    questions.push({
      question: "Yesterday was a high-strain day. How is your body feeling?",
      context: `Strain: ${whoopData.strain.score.toFixed(1)}/21`,
      priority: 7,
    });
  }

  // Sort by priority and return top questions
  return questions.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

// ============================================================================
// Pattern Recognition Prompts (for Claude)
// ============================================================================

export function generatePatternAnalysisPrompt(
  recentEntries: Array<{
    date: string;
    recovery: number | null;
    hrv: number | null;
    sleep: number | null;
    energy: number | null;
    mood: string | null;
    oneThing: string | null;
    priorityCompleted: string | null;
  }>
): string {
  const entriesText = recentEntries
    .map((e) => {
      return `${e.date}: Recovery=${e.recovery ?? 'N/A'}%, HRV=${e.hrv ?? 'N/A'}ms, Sleep=${e.sleep ?? 'N/A'}min, Energy=${e.energy ?? 'N/A'}/10, Mood=${e.mood ?? 'N/A'}, Priority="${e.oneThing ?? 'N/A'}", Completed=${e.priorityCompleted ?? 'N/A'}`;
    })
    .join('\n');

  return `Analyze the following wellness journal data for patterns and insights. Look for:
1. Correlations between metrics (e.g., does high HRV correlate with higher energy?)
2. Trends over time (improving, declining, or stable)
3. Day-of-week patterns
4. Priority completion patterns

Data from the last ${recentEntries.length} days:
${entriesText}

Provide 2-3 brief, actionable insights. Be specific and reference the data. Keep each insight to 1-2 sentences.`;
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get recovery color/category
 */
export function getRecoveryCategory(score: number): {
  label: string;
  color: string;
  emoji: string;
} {
  if (score >= 67) {
    return { label: 'Green', color: 'green', emoji: '🟢' };
  } else if (score >= 34) {
    return { label: 'Yellow', color: 'yellow', emoji: '🟡' };
  } else {
    return { label: 'Red', color: 'red', emoji: '🔴' };
  }
}

/**
 * Get trend arrow
 */
export function getTrendArrow(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    default:
      return '→';
  }
}

/**
 * Format sleep duration for display
 */
export function formatSleepDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Create a simple ASCII progress bar
 */
export function createProgressBar(value: number, max: number = 100, width: number = 10): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Get suggested movement based on recovery
 */
export function getSuggestedMovement(recoveryScore: number): MovementIntention {
  if (recoveryScore >= 67) {
    return 'full_intensity';
  } else if (recoveryScore >= 50) {
    return 'light_workout';
  } else if (recoveryScore >= 34) {
    return 'active_recovery';
  } else {
    return 'rest';
  }
}
