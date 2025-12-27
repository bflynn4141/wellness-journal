/**
 * Core type definitions for the Wellness Journal
 */

// ============================================================================
// Whoop Data Types
// ============================================================================

export interface WhoopRecovery {
  score: number; // 0-100
  hrvRmssd: number; // HRV in milliseconds
  restingHeartRate: number;
  sleepPerformance: number;
  userId: number;
  createdAt: string;
}

export interface WhoopSleepStages {
  rem: number; // minutes
  deep: number;
  light: number;
  awake: number;
}

export interface WhoopSleep {
  id: number;
  qualityDuration: number; // minutes
  totalInBedDuration: number;
  efficiency: number; // percentage
  consistencyScore: number;
  stages: WhoopSleepStages;
  startTime: string;
  endTime: string;
}

export interface WhoopStrain {
  score: number; // 0-21 scale
  averageHeartRate: number;
  maxHeartRate: number;
  calories: number;
  workouts: WhoopWorkout[];
}

export interface WhoopWorkout {
  id: number;
  sport: string;
  startTime: string;
  endTime: string;
  strain: number;
  averageHeartRate: number;
  calories: number;
}

export interface WhoopDailyData {
  date: string;
  recovery: WhoopRecovery | null;
  sleep: WhoopSleep | null;
  strain: WhoopStrain | null;
}

// ============================================================================
// Google Calendar Types
// ============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number; // minutes
  type: 'meeting' | 'focus' | 'personal' | 'other';
  location?: string;
  description?: string;
}

export interface CalendarDay {
  date: string;
  events: CalendarEvent[];
  summary: {
    totalEvents: number;
    meetingMinutes: number;
    focusBlocks: number;
    longestFreeBlock: number; // minutes
  };
}

// ============================================================================
// Journal Entry Types
// ============================================================================

export type MoodOption =
  | 'calm_focused'
  | 'energized'
  | 'tired_okay'
  | 'anxious_stressed'
  | 'low_flat';

export type MovementIntention =
  | 'rest'
  | 'active_recovery'
  | 'light_workout'
  | 'full_intensity';

export type PriorityCompletion = 'yes' | 'partial' | 'no';

export interface MorningEntry {
  date: string;
  timestamp: string;

  // Whoop data (pulled automatically)
  whoopData: WhoopDailyData | null;

  // Calendar data
  calendarData: CalendarDay | null;

  // Subjective ratings
  energyRating: number; // 1-10
  mood: MoodOption;
  sleepReflection: string;

  // Reflections
  yesterdayWin: string;
  yesterdayChallenge: string;

  // Intentions
  oneThing: string;
  movementIntention: MovementIntention;
  successMetric: string;

  // AI-generated content
  patterns?: string;
  dynamicQuestions?: string[];
}

export interface EveningEntry {
  date: string;
  timestamp: string;
  priorityCompleted: PriorityCompletion;
  eveningReflection: string;
  gratitude: string[];
  tomorrowRemember: string;
}

export interface DailyEntry extends MorningEntry {
  evening?: EveningEntry;
}

// ============================================================================
// Historical & Patterns
// ============================================================================

export interface HistoricalStats {
  avgRecovery: number;
  avgHrv: number;
  avgSleep: number;
  avgEnergy: number;
  recoveryTrend: 'up' | 'down' | 'stable';
  hrvTrend: 'up' | 'down' | 'stable';
  sleepTrend: 'up' | 'down' | 'stable';
  daysTracked: number;
}

export interface Pattern {
  id: number;
  detectedAt: string;
  type: 'correlation' | 'trend' | 'anomaly' | 'insight';
  description: string;
  dataPoints: string[]; // array of dates
  confidence: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  whoopClientId?: string;
  whoopClientSecret?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  anthropicApiKey?: string;
  obsidianVaultPath: string;
  obsidianDailyFolder: string;
  dataDir: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

export interface StoredCredentials {
  whoop?: OAuthTokens;
  google?: OAuthTokens;
}
