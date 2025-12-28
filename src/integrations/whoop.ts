/**
 * Whoop API Integration
 *
 * Handles authentication and data fetching from the Whoop API.
 * API docs: https://developer.whoop.com/api
 */

import { getConfig, getTokens, setTokens, isTokenExpired } from '../config.js';
import { performOAuthFlow, refreshAccessToken } from '../utils/auth.js';
import type {
  WhoopDailyData,
  WhoopRecovery,
  WhoopSleep,
  WhoopStrain,
  WhoopWorkout,
  OAuthTokens,
} from '../types.js';

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

const WHOOP_SCOPES = [
  'read:recovery',
  'read:sleep',
  'read:workout',
  'read:cycles',
  'read:profile',
];

/**
 * Authenticate with Whoop (interactive OAuth flow)
 */
export async function authenticateWhoop(): Promise<OAuthTokens> {
  const config = getConfig();

  if (!config.whoopClientId || !config.whoopClientSecret) {
    throw new Error('Whoop client credentials not configured. Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET.');
  }

  const tokens = await performOAuthFlow({
    authorizationUrl: WHOOP_AUTH_URL,
    tokenUrl: WHOOP_TOKEN_URL,
    clientId: config.whoopClientId,
    clientSecret: config.whoopClientSecret,
    scopes: WHOOP_SCOPES,
  });

  setTokens('whoop', tokens);
  return tokens;
}

/**
 * Get a valid access token, refreshing if needed
 */
async function getValidToken(): Promise<string> {
  const config = getConfig();
  let tokens = getTokens('whoop');

  if (!tokens) {
    throw new Error('Whoop not authenticated. Run `wellness-journal setup` first.');
  }

  if (isTokenExpired(tokens)) {
    if (!config.whoopClientId || !config.whoopClientSecret) {
      throw new Error('Whoop client credentials not configured.');
    }

    tokens = await refreshAccessToken(
      WHOOP_TOKEN_URL,
      config.whoopClientId,
      config.whoopClientSecret,
      tokens.refreshToken
    );
    setTokens('whoop', tokens);
  }

  return tokens.accessToken;
}

/**
 * Make an authenticated API request to Whoop
 */
async function whoopFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const token = await getValidToken();

  const url = new URL(`${WHOOP_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whoop API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Get recovery data for a specific date
 */
export async function getRecovery(date: string): Promise<WhoopRecovery | null> {
  interface WhoopRecoveryResponse {
    records: Array<{
      cycle_id: number;
      sleep_id: number;
      user_id: number;
      created_at: string;
      updated_at: string;
      score_state: string;
      score: {
        user_calibrating: boolean;
        recovery_score: number;
        resting_heart_rate: number;
        hrv_rmssd_milli: number;
        spo2_percentage: number;
        skin_temp_celsius: number;
      };
    }>;
  }

  try {
    // Get recovery for the date range
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    const data = await whoopFetch<WhoopRecoveryResponse>('/v2/recovery', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    if (!data.records || data.records.length === 0) {
      return null;
    }

    const record = data.records[0];
    return {
      score: record.score.recovery_score,
      hrvRmssd: record.score.hrv_rmssd_milli,
      restingHeartRate: record.score.resting_heart_rate,
      sleepPerformance: 0, // Calculated from sleep data
      userId: record.user_id,
      createdAt: record.created_at,
    };
  } catch (error) {
    console.error('Error fetching recovery:', error);
    return null;
  }
}

/**
 * Get sleep data for a specific date
 */
export async function getSleep(date: string): Promise<WhoopSleep | null> {
  interface WhoopSleepResponse {
    records: Array<{
      id: number;
      user_id: number;
      created_at: string;
      updated_at: string;
      start: string;
      end: string;
      timezone_offset: string;
      nap: boolean;
      score_state: string;
      score: {
        stage_summary: {
          total_in_bed_time_milli: number;
          total_awake_time_milli: number;
          total_no_data_time_milli: number;
          total_light_sleep_time_milli: number;
          total_slow_wave_sleep_time_milli: number;
          total_rem_sleep_time_milli: number;
          sleep_cycle_count: number;
          disturbance_count: number;
        };
        sleep_needed: {
          baseline_milli: number;
          need_from_sleep_debt_milli: number;
          need_from_recent_strain_milli: number;
          need_from_recent_nap_milli: number;
        };
        respiratory_rate: number;
        sleep_performance_percentage: number;
        sleep_consistency_percentage: number;
        sleep_efficiency_percentage: number;
      };
    }>;
  }

  try {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    const data = await whoopFetch<WhoopSleepResponse>('/v2/activity/sleep', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    // Filter out naps and get the main sleep
    const mainSleep = data.records?.find((r) => !r.nap);
    if (!mainSleep) {
      return null;
    }

    const stages = mainSleep.score.stage_summary;
    const qualityDuration =
      stages.total_light_sleep_time_milli +
      stages.total_slow_wave_sleep_time_milli +
      stages.total_rem_sleep_time_milli;

    return {
      id: mainSleep.id,
      qualityDuration: Math.round(qualityDuration / 60000), // Convert to minutes
      totalInBedDuration: Math.round(stages.total_in_bed_time_milli / 60000),
      efficiency: mainSleep.score.sleep_efficiency_percentage,
      consistencyScore: mainSleep.score.sleep_consistency_percentage,
      stages: {
        rem: Math.round(stages.total_rem_sleep_time_milli / 60000),
        deep: Math.round(stages.total_slow_wave_sleep_time_milli / 60000),
        light: Math.round(stages.total_light_sleep_time_milli / 60000),
        awake: Math.round(stages.total_awake_time_milli / 60000),
      },
      startTime: mainSleep.start,
      endTime: mainSleep.end,
    };
  } catch (error) {
    console.error('Error fetching sleep:', error);
    return null;
  }
}

/**
 * Get strain/workout data for a specific date
 */
export async function getStrain(date: string): Promise<WhoopStrain | null> {
  interface WhoopCycleResponse {
    records: Array<{
      id: number;
      user_id: number;
      created_at: string;
      updated_at: string;
      start: string;
      end: string;
      timezone_offset: string;
      score_state: string;
      score: {
        strain: number;
        kilojoule: number;
        average_heart_rate: number;
        max_heart_rate: number;
      };
    }>;
  }

  interface WhoopWorkoutResponse {
    records: Array<{
      id: number;
      user_id: number;
      created_at: string;
      updated_at: string;
      start: string;
      end: string;
      timezone_offset: string;
      sport_id: number;
      score_state: string;
      score: {
        strain: number;
        average_heart_rate: number;
        max_heart_rate: number;
        kilojoule: number;
        percent_recorded: number;
        distance_meter: number;
        altitude_gain_meter: number;
        altitude_change_meter: number;
        zone_duration: {
          zone_zero_milli: number;
          zone_one_milli: number;
          zone_two_milli: number;
          zone_three_milli: number;
          zone_four_milli: number;
          zone_five_milli: number;
        };
      };
    }>;
  }

  try {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    // Get cycle (daily strain)
    const cycleData = await whoopFetch<WhoopCycleResponse>('/v2/cycle', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    if (!cycleData.records || cycleData.records.length === 0) {
      return null;
    }

    const cycle = cycleData.records[0];

    // Get workouts
    const workoutData = await whoopFetch<WhoopWorkoutResponse>('/v2/activity/workout', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    const workouts: WhoopWorkout[] = (workoutData.records || []).map((w) => ({
      id: w.id,
      sport: getSportName(w.sport_id),
      startTime: w.start,
      endTime: w.end,
      strain: w.score.strain,
      averageHeartRate: w.score.average_heart_rate,
      calories: Math.round(w.score.kilojoule / 4.184), // Convert kJ to kcal
    }));

    return {
      score: cycle.score.strain,
      averageHeartRate: cycle.score.average_heart_rate,
      maxHeartRate: cycle.score.max_heart_rate,
      calories: Math.round(cycle.score.kilojoule / 4.184),
      workouts,
    };
  } catch (error) {
    console.error('Error fetching strain:', error);
    return null;
  }
}

/**
 * Get all Whoop data for a specific date
 */
export async function getWhoopDailyData(date: string): Promise<WhoopDailyData> {
  const [recovery, sleep, strain] = await Promise.all([
    getRecovery(date),
    getSleep(date),
    getStrain(date),
  ]);

  return {
    date,
    recovery,
    sleep,
    strain,
  };
}

/**
 * Check if Whoop is authenticated
 * Note: Whoop may not provide refresh tokens, so we check for access token
 */
export function isWhoopAuthenticated(): boolean {
  const tokens = getTokens('whoop');
  // Check for access token - Whoop uses long-lived tokens and may not provide refresh tokens
  return !!tokens?.accessToken;
}

/**
 * Map Whoop sport IDs to readable names
 */
function getSportName(sportId: number): string {
  const sports: Record<number, string> = {
    0: 'Running',
    1: 'Cycling',
    16: 'Baseball',
    17: 'Basketball',
    18: 'Rowing',
    19: 'Fencing',
    20: 'Field Hockey',
    21: 'Football',
    22: 'Golf',
    24: 'Ice Hockey',
    25: 'Lacrosse',
    27: 'Rugby',
    28: 'Sailing',
    29: 'Skiing',
    30: 'Soccer',
    31: 'Softball',
    32: 'Squash',
    33: 'Swimming',
    34: 'Tennis',
    35: 'Track & Field',
    36: 'Volleyball',
    37: 'Water Polo',
    38: 'Wrestling',
    39: 'Boxing',
    42: 'Dance',
    43: 'Pilates',
    44: 'Yoga',
    45: 'Weightlifting',
    47: 'Cross Country Skiing',
    48: 'Functional Fitness',
    49: 'Duathlon',
    51: 'Gymnastics',
    52: 'HIIT',
    53: 'Hiking',
    55: 'Horseback Riding',
    56: 'Kayaking',
    57: 'Martial Arts',
    59: 'Mountain Biking',
    60: 'Paddleboarding',
    62: 'Rock Climbing',
    63: 'Snowboarding',
    64: 'Surfing',
    66: 'Triathlon',
    70: 'Walking',
    71: 'Wheelchair Pushing',
    73: 'Other',
    74: 'Meditation',
    75: 'Spin',
    76: 'Massage',
    84: 'Pickleball',
  };

  // Handle special case for -1 (generic activity)
  if (sportId === -1) return 'Activity';

  return sports[sportId] || 'Activity';
}
