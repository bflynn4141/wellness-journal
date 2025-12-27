/**
 * Setup Command
 *
 * Interactive setup wizard for configuring API integrations.
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

import { getConfig, checkIntegrations, validateConfig } from '../config.js';
import { authenticateWhoop, isWhoopAuthenticated } from '../integrations/whoop.js';
import { authenticateGoogle, isGoogleAuthenticated } from '../integrations/calendar.js';
import { initDatabase } from '../db/sqlite.js';
import { getRedirectUri, REDIRECT_URI } from '../utils/auth.js';

export async function runSetup(): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan.bold('🔧 Wellness Journal Setup'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log('');

  // Initialize database
  const dbSpinner = ora('Initializing database...').start();
  try {
    initDatabase();
    dbSpinner.succeed('Database initialized');
  } catch (error) {
    dbSpinner.fail('Database initialization failed');
    console.error(error);
    return;
  }

  // Check current status
  const integrations = checkIntegrations();
  const config = getConfig();
  const missing = validateConfig();

  console.log('\n');
  console.log(chalk.cyan('Current Status:'));
  console.log(`  Whoop:           ${integrations.whoop ? chalk.green('✓ Connected') : chalk.yellow('○ Not connected')}`);
  console.log(`  Google Calendar: ${integrations.google ? chalk.green('✓ Connected') : chalk.yellow('○ Not connected')}`);
  console.log(`  Claude API:      ${integrations.claude ? chalk.green('✓ Configured') : chalk.yellow('○ Not configured')}`);
  console.log(`  Obsidian Vault:  ${chalk.blue(config.obsidianVaultPath)}`);
  console.log(`  OAuth Redirect:  ${chalk.blue(getRedirectUri())}`);
  console.log('');

  if (missing.length > 0) {
    console.log(chalk.yellow('Missing environment variables:'));
    missing.forEach((m) => console.log(chalk.yellow(`  • ${m}`)));
    console.log('');
    console.log(chalk.gray('Add these to your .env file or environment.'));
    console.log(chalk.gray('See .env.example for reference.'));
    console.log('');
  }

  // Setup menu
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to set up?',
      choices: [
        {
          name: `${integrations.whoop ? '✓' : '○'} Connect Whoop`,
          value: 'whoop',
        },
        {
          name: `${integrations.google ? '✓' : '○'} Connect Google Calendar`,
          value: 'google',
        },
        {
          name: '📖 View setup instructions',
          value: 'instructions',
        },
        {
          name: '✅ Done',
          value: 'done',
        },
      ],
    },
  ]);

  switch (action) {
    case 'whoop':
      await setupWhoop();
      break;
    case 'google':
      await setupGoogle();
      break;
    case 'instructions':
      showInstructions();
      break;
    case 'done':
      console.log(chalk.green('\n✨ Setup complete! Run `wellness-journal morning` to start.\n'));
      return;
  }

  // Loop back to menu
  await runSetup();
}

async function setupWhoop(): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan.bold('Whoop Setup'));
  console.log(chalk.gray('─'.repeat(50)));

  const config = getConfig();

  const redirectUri = getRedirectUri();

  if (!config.whoopClientId || !config.whoopClientSecret) {
    console.log(chalk.yellow('\n⚠️  Whoop API credentials not found in environment.'));
    console.log('');
    console.log('To set up Whoop:');
    console.log('1. Go to https://developer.whoop.com');
    console.log('2. Create a new application');
    console.log(`3. Set the redirect URI to: ${chalk.cyan(redirectUri)}`);
    console.log(`4. Set the privacy policy URL to your GitHub Pages URL`);
    console.log('5. Copy the Client ID and Client Secret');
    console.log('6. Add them to your .env file:');
    console.log(chalk.gray('   WHOOP_CLIENT_ID=your_client_id'));
    console.log(chalk.gray('   WHOOP_CLIENT_SECRET=your_client_secret'));
    console.log('');
    return;
  }

  if (isWhoopAuthenticated()) {
    const { reconnect } = await inquirer.prompt<{ reconnect: boolean }>([
      {
        type: 'confirm',
        name: 'reconnect',
        message: 'Whoop is already connected. Reconnect?',
        default: false,
      },
    ]);

    if (!reconnect) return;
  }

  console.log('');
  console.log('Opening browser for Whoop authorization...');
  console.log(chalk.gray('(You may need to log in to your Whoop account)'));
  console.log('');

  const spinner = ora('Waiting for authorization...').start();

  try {
    await authenticateWhoop();
    spinner.succeed('Whoop connected successfully!');
  } catch (error) {
    spinner.fail('Whoop authorization failed');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function setupGoogle(): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan.bold('Google Calendar Setup'));
  console.log(chalk.gray('─'.repeat(50)));

  const config = getConfig();

  const googleRedirectUri = getRedirectUri();

  if (!config.googleClientId || !config.googleClientSecret) {
    console.log(chalk.yellow('\n⚠️  Google API credentials not found in environment.'));
    console.log('');
    console.log('To set up Google Calendar:');
    console.log('1. Go to https://console.cloud.google.com');
    console.log('2. Create a new project (or select existing)');
    console.log('3. Enable the Google Calendar API');
    console.log('4. Create OAuth 2.0 credentials (Web application type)');
    console.log(`5. Add ${chalk.cyan(googleRedirectUri)} to authorized redirect URIs`);
    console.log('6. Copy the Client ID and Client Secret');
    console.log('7. Add them to your .env file:');
    console.log(chalk.gray('   GOOGLE_CLIENT_ID=your_client_id'));
    console.log(chalk.gray('   GOOGLE_CLIENT_SECRET=your_client_secret'));
    console.log('');
    return;
  }

  if (isGoogleAuthenticated()) {
    const { reconnect } = await inquirer.prompt<{ reconnect: boolean }>([
      {
        type: 'confirm',
        name: 'reconnect',
        message: 'Google Calendar is already connected. Reconnect?',
        default: false,
      },
    ]);

    if (!reconnect) return;
  }

  console.log('');
  console.log('Opening browser for Google authorization...');
  console.log(chalk.gray('(You may need to log in to your Google account)'));
  console.log('');

  const spinner = ora('Waiting for authorization...').start();

  try {
    await authenticateGoogle();
    spinner.succeed('Google Calendar connected successfully!');
  } catch (error) {
    spinner.fail('Google authorization failed');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

function showInstructions(): void {
  console.log('\n');
  console.log(chalk.cyan.bold('📖 Setup Instructions'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log('');
  console.log(chalk.bold('1. Create a .env file'));
  console.log('   Copy .env.example to .env and fill in your values.');
  console.log('');
  console.log(chalk.bold('2. Whoop API Setup'));
  console.log('   • Visit https://developer.whoop.com');
  console.log('   • Sign in with your Whoop account');
  console.log('   • Create a new application');
  console.log(`   • Redirect URI: ${chalk.cyan(REDIRECT_URI)}`);
  console.log('   • Copy Client ID and Secret to .env');
  console.log('');
  console.log(chalk.bold('3. Google Calendar Setup'));
  console.log('   • Visit https://console.cloud.google.com');
  console.log('   • Create project → Enable Calendar API');
  console.log('   • Create OAuth credentials (Desktop type)');
  console.log(`   • Add redirect URI: ${chalk.cyan(REDIRECT_URI)}`);
  console.log('   • Copy Client ID and Secret to .env');
  console.log('');
  console.log(chalk.bold('4. Claude API (Optional)'));
  console.log('   • Visit https://console.anthropic.com');
  console.log('   • Create an API key');
  console.log('   • Add ANTHROPIC_API_KEY to .env');
  console.log('');
  console.log(chalk.bold('5. Obsidian Vault'));
  console.log('   • Set OBSIDIAN_VAULT_PATH in .env');
  console.log('   • Example: ~/Documents/Obsidian/MyVault');
  console.log('');
}
