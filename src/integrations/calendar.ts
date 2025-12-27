/**
 * Google Calendar API Integration
 *
 * Handles authentication and event fetching from Google Calendar.
 */

import { getConfig, getTokens, setTokens, isTokenExpired } from '../config.js';
import { performOAuthFlow, refreshAccessToken } from '../utils/auth.js';
import type { CalendarDay, CalendarEvent, OAuthTokens } from '../types.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

/**
 * Authenticate with Google (interactive OAuth flow)
 */
export async function authenticateGoogle(): Promise<OAuthTokens> {
  const config = getConfig();

  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error('Google client credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  const tokens = await performOAuthFlow({
    authorizationUrl: GOOGLE_AUTH_URL,
    tokenUrl: GOOGLE_TOKEN_URL,
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    scopes: GOOGLE_SCOPES,
  });

  setTokens('google', tokens);
  return tokens;
}

/**
 * Get a valid access token, refreshing if needed
 */
async function getValidToken(): Promise<string> {
  const config = getConfig();
  let tokens = getTokens('google');

  if (!tokens) {
    throw new Error('Google Calendar not authenticated. Run `wellness-journal setup` first.');
  }

  if (isTokenExpired(tokens)) {
    if (!config.googleClientId || !config.googleClientSecret) {
      throw new Error('Google client credentials not configured.');
    }

    tokens = await refreshAccessToken(
      GOOGLE_TOKEN_URL,
      config.googleClientId,
      config.googleClientSecret,
      tokens.refreshToken
    );
    setTokens('google', tokens);
  }

  return tokens.accessToken;
}

/**
 * Make an authenticated API request to Google Calendar
 */
async function calendarFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const token = await getValidToken();

  const url = new URL(`${GOOGLE_CALENDAR_API}${endpoint}`);
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
    throw new Error(`Google Calendar API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Get calendar events for a specific date
 */
export async function getCalendarEvents(date: string): Promise<CalendarDay> {
  interface GoogleCalendarEvent {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start: {
      dateTime?: string;
      date?: string;
      timeZone?: string;
    };
    end: {
      dateTime?: string;
      date?: string;
      timeZone?: string;
    };
    eventType?: string;
  }

  interface GoogleCalendarResponse {
    items?: GoogleCalendarEvent[];
  }

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const data = await calendarFetch<GoogleCalendarResponse>('/calendars/primary/events', {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const events: CalendarEvent[] = (data.items || [])
      .filter((event) => event.start?.dateTime) // Only timed events, not all-day
      .map((event) => {
        const start = new Date(event.start.dateTime!);
        const end = new Date(event.end.dateTime!);
        const durationMs = end.getTime() - start.getTime();
        const durationMinutes = Math.round(durationMs / 60000);

        return {
          id: event.id,
          title: event.summary || 'Untitled Event',
          startTime: event.start.dateTime!,
          endTime: event.end.dateTime!,
          duration: durationMinutes,
          type: categorizeEvent(event.summary || '', event.description || ''),
          location: event.location,
          description: event.description,
        };
      });

    // Sort by start time
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // Calculate summary
    const meetingMinutes = events
      .filter((e) => e.type === 'meeting')
      .reduce((sum, e) => sum + e.duration, 0);

    const focusBlocks = events.filter((e) => e.type === 'focus').length;

    // Calculate longest free block
    const longestFreeBlock = calculateLongestFreeBlock(events, date);

    return {
      date,
      events,
      summary: {
        totalEvents: events.length,
        meetingMinutes,
        focusBlocks,
        longestFreeBlock,
      },
    };
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return {
      date,
      events: [],
      summary: {
        totalEvents: 0,
        meetingMinutes: 0,
        focusBlocks: 0,
        longestFreeBlock: 0,
      },
    };
  }
}

/**
 * Categorize an event based on its title and description
 */
function categorizeEvent(title: string, description: string): CalendarEvent['type'] {
  const combined = `${title} ${description}`.toLowerCase();

  // Focus time indicators
  const focusKeywords = ['focus', 'deep work', 'heads down', 'no meetings', 'blocked', 'focus time'];
  if (focusKeywords.some((kw) => combined.includes(kw))) {
    return 'focus';
  }

  // Personal time indicators
  const personalKeywords = ['lunch', 'break', 'gym', 'workout', 'doctor', 'dentist', 'personal', 'errand'];
  if (personalKeywords.some((kw) => combined.includes(kw))) {
    return 'personal';
  }

  // Meeting indicators (most events with other people)
  const meetingKeywords = ['meeting', 'sync', 'standup', 'stand-up', '1:1', '1-1', 'call', 'chat', 'review', 'interview'];
  if (meetingKeywords.some((kw) => combined.includes(kw))) {
    return 'meeting';
  }

  // Default to meeting if it looks like it has other participants
  // (most calendar events with specific times are meetings)
  return 'meeting';
}

/**
 * Calculate the longest free block during work hours (9am-6pm)
 */
function calculateLongestFreeBlock(events: CalendarEvent[], date: string): number {
  const workStart = new Date(date);
  workStart.setHours(9, 0, 0, 0);

  const workEnd = new Date(date);
  workEnd.setHours(18, 0, 0, 0);

  if (events.length === 0) {
    return Math.round((workEnd.getTime() - workStart.getTime()) / 60000);
  }

  // Build list of busy periods
  const busyPeriods = events.map((e) => ({
    start: new Date(e.startTime).getTime(),
    end: new Date(e.endTime).getTime(),
  }));

  // Sort by start time
  busyPeriods.sort((a, b) => a.start - b.start);

  // Find free blocks
  let longestFree = 0;
  let currentFreeStart = workStart.getTime();

  for (const busy of busyPeriods) {
    if (busy.start > currentFreeStart) {
      const freeMinutes = Math.round((busy.start - currentFreeStart) / 60000);
      longestFree = Math.max(longestFree, freeMinutes);
    }
    currentFreeStart = Math.max(currentFreeStart, busy.end);
  }

  // Check final free block until end of work day
  if (currentFreeStart < workEnd.getTime()) {
    const freeMinutes = Math.round((workEnd.getTime() - currentFreeStart) / 60000);
    longestFree = Math.max(longestFree, freeMinutes);
  }

  return longestFree;
}

/**
 * Check if Google Calendar is authenticated
 */
export function isGoogleAuthenticated(): boolean {
  const tokens = getTokens('google');
  return !!tokens?.refreshToken;
}

/**
 * Format time for display (e.g., "9:00 AM")
 */
export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format duration for display (e.g., "1h 30m")
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
