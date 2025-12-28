/**
 * Configuration management for Wellness Journal
 *
 * Handles loading config from environment variables and .env files,
 * and provides secure storage for OAuth tokens.
 */

import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import type { AppConfig, StoredCredentials, OAuthTokens } from './types.js';

// Load .env file if present
loadEnv();

// Default paths
const DEFAULT_DATA_DIR = join(homedir(), '.wellness-journal');
const DEFAULT_VAULT_PATH = join(homedir(), 'Documents', 'Obsidian', 'Wellness-Journal');

// Encrypted config store for sensitive data (tokens)
const credentialStore = new Conf<StoredCredentials>({
  projectName: 'wellness-journal',
  configName: 'credentials',
  encryptionKey: 'wellness-journal-local-encryption-key', // Local encryption
  schema: {
    whoop: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresAt: { type: 'number' },
        tokenType: { type: 'string' },
        scope: { type: 'string' },
      },
    },
    google: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresAt: { type: 'number' },
        tokenType: { type: 'string' },
        scope: { type: 'string' },
      },
    },
  },
});

/**
 * Get the application configuration from environment variables
 */
export function getConfig(): AppConfig {
  const dataDir = process.env.WELLNESS_DATA_DIR || DEFAULT_DATA_DIR;

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Expand ~ in vault path
  let vaultPath = process.env.OBSIDIAN_VAULT_PATH || DEFAULT_VAULT_PATH;
  if (vaultPath.startsWith('~')) {
    vaultPath = join(homedir(), vaultPath.slice(1));
  }

  return {
    whoopClientId: process.env.WHOOP_CLIENT_ID,
    whoopClientSecret: process.env.WHOOP_CLIENT_SECRET,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    obsidianVaultPath: vaultPath,
    obsidianDailyFolder: process.env.OBSIDIAN_DAILY_FOLDER || 'Daily',
    dataDir,
  };
}

/**
 * Check if all required integrations are configured
 */
export function checkIntegrations(): {
  whoop: boolean;
  google: boolean;
  claude: boolean;
} {
  const config = getConfig();
  const creds = getCredentials();

  return {
    // Whoop uses long-lived access tokens and may not provide refresh tokens
    whoop: !!(config.whoopClientId && config.whoopClientSecret && creds.whoop?.accessToken),
    google: !!(config.googleClientId && config.googleClientSecret && creds.google?.refreshToken),
    claude: !!config.anthropicApiKey,
  };
}

/**
 * Get stored OAuth credentials
 */
export function getCredentials(): StoredCredentials {
  return {
    whoop: credentialStore.get('whoop'),
    google: credentialStore.get('google'),
  };
}

/**
 * Store OAuth tokens for a service
 */
export function setTokens(service: 'whoop' | 'google', tokens: OAuthTokens): void {
  credentialStore.set(service, tokens);
}

/**
 * Get OAuth tokens for a service
 */
export function getTokens(service: 'whoop' | 'google'): OAuthTokens | undefined {
  return credentialStore.get(service);
}

/**
 * Clear tokens for a service
 */
export function clearTokens(service: 'whoop' | 'google'): void {
  credentialStore.delete(service);
}

/**
 * Check if tokens are expired (with 5 minute buffer)
 */
export function isTokenExpired(tokens: OAuthTokens): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= tokens.expiresAt - bufferMs;
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
  const config = getConfig();
  return join(config.dataDir, 'wellness.db');
}

/**
 * Get the path for daily notes in Obsidian
 */
export function getDailyNotePath(date: string): string {
  const config = getConfig();
  const dailyFolder = join(config.obsidianVaultPath, config.obsidianDailyFolder);

  // Ensure folder exists
  if (!existsSync(dailyFolder)) {
    mkdirSync(dailyFolder, { recursive: true });
  }

  return join(dailyFolder, `${date}.md`);
}

/**
 * Validate the configuration and return any missing items
 */
export function validateConfig(): string[] {
  const config = getConfig();
  const missing: string[] = [];

  if (!config.whoopClientId) missing.push('WHOOP_CLIENT_ID');
  if (!config.whoopClientSecret) missing.push('WHOOP_CLIENT_SECRET');
  if (!config.googleClientId) missing.push('GOOGLE_CLIENT_ID');
  if (!config.googleClientSecret) missing.push('GOOGLE_CLIENT_SECRET');

  return missing;
}
