/**
 * SQLite database layer for Wellness Journal
 *
 * Handles persistent storage of daily entries, patterns, and historical data.
 * Uses better-sqlite3 for synchronous, performant queries.
 */

import Database from 'better-sqlite3';
import { getDatabasePath } from '../config.js';
import type {
  DailyEntry,
  MorningEntry,
  EveningEntry,
  HistoricalStats,
  Pattern,
  WhoopDailyData,
  CalendarDay,
} from '../types.js';

let db: Database.Database | null = null;

/**
 * Initialize the database connection and create tables if needed
 */
export function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDatabasePath();
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- Core daily entries table
    CREATE TABLE IF NOT EXISTS daily_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),

      -- Whoop data (stored as JSON for flexibility)
      whoop_data TEXT,

      -- Calendar data
      calendar_data TEXT,

      -- Extracted metrics for easy querying
      recovery_score REAL,
      hrv REAL,
      resting_hr REAL,
      sleep_quality_minutes INTEGER,
      sleep_efficiency REAL,
      strain_score REAL,

      -- Subjective ratings
      energy_rating INTEGER CHECK(energy_rating BETWEEN 1 AND 10),
      mood TEXT,
      sleep_reflection TEXT,

      -- Reflections
      yesterday_win TEXT,
      yesterday_challenge TEXT,

      -- Intentions
      one_thing TEXT,
      movement_intention TEXT,
      success_metric TEXT,

      -- AI-generated content
      patterns TEXT,
      dynamic_questions TEXT,

      -- Evening follow-up
      priority_completed TEXT CHECK(priority_completed IN ('yes', 'partial', 'no', NULL)),
      evening_reflection TEXT,
      gratitude TEXT,
      tomorrow_remember TEXT
    );

    -- Index for date queries
    CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(date);

    -- Calendar events table
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      event_id TEXT,
      title TEXT,
      start_time TEXT,
      end_time TEXT,
      duration_minutes INTEGER,
      event_type TEXT,
      UNIQUE(date, event_id)
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);

    -- Detected patterns table
    CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      detected_at TEXT DEFAULT (datetime('now')),
      pattern_type TEXT CHECK(pattern_type IN ('correlation', 'trend', 'anomaly', 'insight')),
      description TEXT,
      data_points TEXT,
      confidence REAL,
      dismissed INTEGER DEFAULT 0
    );

    -- Weekly averages view
    CREATE VIEW IF NOT EXISTS weekly_averages AS
    SELECT
      strftime('%Y-W%W', date) as week,
      COUNT(*) as days_tracked,
      AVG(recovery_score) as avg_recovery,
      AVG(hrv) as avg_hrv,
      AVG(sleep_quality_minutes) as avg_sleep_minutes,
      AVG(energy_rating) as avg_energy,
      AVG(strain_score) as avg_strain
    FROM daily_entries
    WHERE recovery_score IS NOT NULL
    GROUP BY week
    ORDER BY week DESC;

    -- Monthly averages view
    CREATE VIEW IF NOT EXISTS monthly_averages AS
    SELECT
      strftime('%Y-%m', date) as month,
      COUNT(*) as days_tracked,
      AVG(recovery_score) as avg_recovery,
      AVG(hrv) as avg_hrv,
      AVG(sleep_quality_minutes) as avg_sleep_minutes,
      AVG(energy_rating) as avg_energy,
      AVG(strain_score) as avg_strain
    FROM daily_entries
    WHERE recovery_score IS NOT NULL
    GROUP BY month
    ORDER BY month DESC;
  `);

  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Save a morning entry to the database
 */
export function saveMorningEntry(entry: MorningEntry): void {
  const database = initDatabase();

  const stmt = database.prepare(`
    INSERT INTO daily_entries (
      date,
      whoop_data,
      calendar_data,
      recovery_score,
      hrv,
      resting_hr,
      sleep_quality_minutes,
      sleep_efficiency,
      strain_score,
      energy_rating,
      mood,
      sleep_reflection,
      yesterday_win,
      yesterday_challenge,
      one_thing,
      movement_intention,
      success_metric,
      patterns,
      dynamic_questions
    ) VALUES (
      @date,
      @whoopData,
      @calendarData,
      @recoveryScore,
      @hrv,
      @restingHr,
      @sleepQualityMinutes,
      @sleepEfficiency,
      @strainScore,
      @energyRating,
      @mood,
      @sleepReflection,
      @yesterdayWin,
      @yesterdayChallenge,
      @oneThing,
      @movementIntention,
      @successMetric,
      @patterns,
      @dynamicQuestions
    )
    ON CONFLICT(date) DO UPDATE SET
      whoop_data = @whoopData,
      calendar_data = @calendarData,
      recovery_score = @recoveryScore,
      hrv = @hrv,
      resting_hr = @restingHr,
      sleep_quality_minutes = @sleepQualityMinutes,
      sleep_efficiency = @sleepEfficiency,
      strain_score = @strainScore,
      energy_rating = @energyRating,
      mood = @mood,
      sleep_reflection = @sleepReflection,
      yesterday_win = @yesterdayWin,
      yesterday_challenge = @yesterdayChallenge,
      one_thing = @oneThing,
      movement_intention = @movementIntention,
      success_metric = @successMetric,
      patterns = @patterns,
      dynamic_questions = @dynamicQuestions,
      updated_at = datetime('now')
  `);

  stmt.run({
    date: entry.date,
    whoopData: entry.whoopData ? JSON.stringify(entry.whoopData) : null,
    calendarData: entry.calendarData ? JSON.stringify(entry.calendarData) : null,
    recoveryScore: entry.whoopData?.recovery?.score ?? null,
    hrv: entry.whoopData?.recovery?.hrvRmssd ?? null,
    restingHr: entry.whoopData?.recovery?.restingHeartRate ?? null,
    sleepQualityMinutes: entry.whoopData?.sleep?.qualityDuration ?? null,
    sleepEfficiency: entry.whoopData?.sleep?.efficiency ?? null,
    strainScore: entry.whoopData?.strain?.score ?? null,
    energyRating: entry.energyRating,
    mood: entry.mood,
    sleepReflection: entry.sleepReflection,
    yesterdayWin: entry.yesterdayWin,
    yesterdayChallenge: entry.yesterdayChallenge,
    oneThing: entry.oneThing,
    movementIntention: entry.movementIntention,
    successMetric: entry.successMetric,
    patterns: entry.patterns ?? null,
    dynamicQuestions: entry.dynamicQuestions ? JSON.stringify(entry.dynamicQuestions) : null,
  });
}

/**
 * Save an evening entry to the database
 */
export function saveEveningEntry(entry: EveningEntry): void {
  const database = initDatabase();

  const stmt = database.prepare(`
    UPDATE daily_entries SET
      priority_completed = @priorityCompleted,
      evening_reflection = @eveningReflection,
      gratitude = @gratitude,
      tomorrow_remember = @tomorrowRemember,
      updated_at = datetime('now')
    WHERE date = @date
  `);

  stmt.run({
    date: entry.date,
    priorityCompleted: entry.priorityCompleted,
    eveningReflection: entry.eveningReflection,
    gratitude: JSON.stringify(entry.gratitude),
    tomorrowRemember: entry.tomorrowRemember,
  });
}

/**
 * Get a daily entry by date
 */
export function getDailyEntry(date: string): DailyEntry | null {
  const database = initDatabase();

  const row = database.prepare(`
    SELECT * FROM daily_entries WHERE date = ?
  `).get(date) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToDailyEntry(row);
}

/**
 * Get entries for the last N days
 */
export function getRecentEntries(days: number): DailyEntry[] {
  const database = initDatabase();

  const rows = database.prepare(`
    SELECT * FROM daily_entries
    WHERE date >= date('now', '-' || ? || ' days')
    ORDER BY date DESC
  `).all(days) as Record<string, unknown>[];

  return rows.map(rowToDailyEntry);
}

/**
 * Get historical statistics for pattern analysis
 */
export function getHistoricalStats(days: number = 7): HistoricalStats {
  const database = initDatabase();

  const stats = database.prepare(`
    SELECT
      AVG(recovery_score) as avg_recovery,
      AVG(hrv) as avg_hrv,
      AVG(sleep_quality_minutes) as avg_sleep,
      AVG(energy_rating) as avg_energy,
      COUNT(*) as days_tracked
    FROM daily_entries
    WHERE date >= date('now', '-' || ? || ' days')
      AND recovery_score IS NOT NULL
  `).get(days) as Record<string, number | null>;

  // Calculate trends (compare last 3 days to previous 4 days)
  const recentTrend = database.prepare(`
    SELECT
      AVG(CASE WHEN date >= date('now', '-3 days') THEN recovery_score END) as recent_recovery,
      AVG(CASE WHEN date < date('now', '-3 days') THEN recovery_score END) as older_recovery,
      AVG(CASE WHEN date >= date('now', '-3 days') THEN hrv END) as recent_hrv,
      AVG(CASE WHEN date < date('now', '-3 days') THEN hrv END) as older_hrv,
      AVG(CASE WHEN date >= date('now', '-3 days') THEN sleep_quality_minutes END) as recent_sleep,
      AVG(CASE WHEN date < date('now', '-3 days') THEN sleep_quality_minutes END) as older_sleep
    FROM daily_entries
    WHERE date >= date('now', '-7 days')
  `).get() as Record<string, number | null>;

  const calculateTrend = (recent: number | null, older: number | null): 'up' | 'down' | 'stable' => {
    if (recent === null || older === null) return 'stable';
    const diff = ((recent - older) / older) * 100;
    if (diff > 5) return 'up';
    if (diff < -5) return 'down';
    return 'stable';
  };

  return {
    avgRecovery: stats.avg_recovery ?? 0,
    avgHrv: stats.avg_hrv ?? 0,
    avgSleep: stats.avg_sleep ?? 0,
    avgEnergy: stats.avg_energy ?? 0,
    daysTracked: stats.days_tracked ?? 0,
    recoveryTrend: calculateTrend(recentTrend.recent_recovery, recentTrend.older_recovery),
    hrvTrend: calculateTrend(recentTrend.recent_hrv, recentTrend.older_hrv),
    sleepTrend: calculateTrend(recentTrend.recent_sleep, recentTrend.older_sleep),
  };
}

/**
 * Save a detected pattern
 */
export function savePattern(pattern: Omit<Pattern, 'id' | 'detectedAt'>): void {
  const database = initDatabase();

  database.prepare(`
    INSERT INTO patterns (pattern_type, description, data_points, confidence)
    VALUES (@type, @description, @dataPoints, @confidence)
  `).run({
    type: pattern.type,
    description: pattern.description,
    dataPoints: JSON.stringify(pattern.dataPoints),
    confidence: pattern.confidence,
  });
}

/**
 * Get recent undismissed patterns
 */
export function getRecentPatterns(limit: number = 5): Pattern[] {
  const database = initDatabase();

  const rows = database.prepare(`
    SELECT * FROM patterns
    WHERE dismissed = 0
    ORDER BY detected_at DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as number,
    detectedAt: row.detected_at as string,
    type: row.pattern_type as Pattern['type'],
    description: row.description as string,
    dataPoints: JSON.parse(row.data_points as string),
    confidence: row.confidence as number,
  }));
}

/**
 * Helper to convert a database row to a DailyEntry
 */
function rowToDailyEntry(row: Record<string, unknown>): DailyEntry {
  const whoopData = row.whoop_data ? JSON.parse(row.whoop_data as string) as WhoopDailyData : null;
  const calendarData = row.calendar_data ? JSON.parse(row.calendar_data as string) as CalendarDay : null;

  const entry: DailyEntry = {
    date: row.date as string,
    timestamp: row.created_at as string,
    whoopData,
    calendarData,
    energyRating: row.energy_rating as number,
    mood: row.mood as DailyEntry['mood'],
    sleepReflection: row.sleep_reflection as string,
    yesterdayWin: row.yesterday_win as string,
    yesterdayChallenge: row.yesterday_challenge as string,
    oneThing: row.one_thing as string,
    movementIntention: row.movement_intention as DailyEntry['movementIntention'],
    successMetric: row.success_metric as string,
    patterns: row.patterns as string | undefined,
    dynamicQuestions: row.dynamic_questions
      ? JSON.parse(row.dynamic_questions as string)
      : undefined,
  };

  if (row.priority_completed) {
    entry.evening = {
      date: row.date as string,
      timestamp: row.updated_at as string,
      priorityCompleted: row.priority_completed as EveningEntry['priorityCompleted'],
      eveningReflection: row.evening_reflection as string,
      gratitude: row.gratitude ? JSON.parse(row.gratitude as string) : [],
      tomorrowRemember: row.tomorrow_remember as string,
    };
  }

  return entry;
}
