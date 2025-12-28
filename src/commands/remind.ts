/**
 * Remind Command
 *
 * Sends notifications for morning/evening check-ins based on time of day.
 * Can be scheduled via cron or launchd for automated reminders.
 */

import chalk from 'chalk';
import dayjs from 'dayjs';
import notifier from 'node-notifier';

import { initDatabase, getDailyEntry, getCurrentStreak } from '../db/sqlite.js';

interface ReminderConfig {
  morningStart: number;  // Hour to start morning reminders (e.g., 6)
  morningEnd: number;    // Hour to stop morning reminders (e.g., 10)
  eveningStart: number;  // Hour to start evening reminders (e.g., 20)
  eveningEnd: number;    // Hour to stop evening reminders (e.g., 23)
}

const DEFAULT_CONFIG: ReminderConfig = {
  morningStart: 6,
  morningEnd: 10,
  eveningStart: 20,
  eveningEnd: 23,
};

export async function runRemind(silent: boolean = false): Promise<void> {
  initDatabase();

  const now = dayjs();
  const today = now.format('YYYY-MM-DD');
  const currentHour = now.hour();
  const config = DEFAULT_CONFIG;

  // Get today's entry
  const todayEntry = getDailyEntry(today);
  const streak = getCurrentStreak();

  // Determine what reminder is needed
  let reminderType: 'morning' | 'evening' | 'none' = 'none';
  let message = '';
  let subtitle = '';

  // Morning window: check if morning check-in is missing
  if (currentHour >= config.morningStart && currentHour < config.morningEnd) {
    if (!todayEntry) {
      reminderType = 'morning';
      message = "Time for your morning check-in!";
      subtitle = streak > 0
        ? `Keep your ${streak}-day streak alive`
        : "Start your wellness journey today";
    }
  }

  // Evening window: check if evening reflection is missing
  if (currentHour >= config.eveningStart && currentHour < config.eveningEnd) {
    if (todayEntry && !todayEntry.evening) {
      reminderType = 'evening';
      message = "Time for your evening reflection!";
      subtitle = `How did today go? Did you accomplish "${todayEntry.oneThing}"?`;
    } else if (!todayEntry) {
      reminderType = 'morning';
      message = "You missed today's check-in!";
      subtitle = "Run `wellness-journal morning` to log your day";
    }
  }

  // Console output (for cron logs)
  if (!silent) {
    console.log('\n');
    console.log(chalk.cyan.bold('🔔 Wellness Journal Reminder'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`  Time:   ${now.format('h:mm A')}`);
    console.log(`  Streak: ${streak} day${streak !== 1 ? 's' : ''}`);
    console.log('');
  }

  if (reminderType === 'none') {
    if (!silent) {
      console.log(chalk.green('  ✓ All caught up! No reminders needed.'));
      if (todayEntry) {
        console.log(chalk.gray(`  Morning: ✓ Complete`));
        console.log(chalk.gray(`  Evening: ${todayEntry.evening ? '✓ Complete' : '○ Pending (after 8pm)'}`));
      }
      console.log('');
    }
    return;
  }

  // Send desktop notification
  notifier.notify({
    title: 'Wellness Journal',
    message,
    subtitle,
    sound: true,
    timeout: 10,
    actions: ['Open', 'Later'],
    closeLabel: 'Later',
  });

  if (!silent) {
    console.log(chalk.yellow(`  📱 ${reminderType.charAt(0).toUpperCase() + reminderType.slice(1)} reminder sent!`));
    console.log('');
    console.log(chalk.gray(`  Run: wellness-journal ${reminderType}`));
    console.log('');
  }
}

/**
 * Display setup instructions for automated reminders
 */
export function showScheduleSetup(): void {
  console.log('\n');
  console.log(chalk.cyan.bold('⏰ Scheduling Automated Reminders'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log('');
  console.log('To receive automatic reminders, schedule the remind command');
  console.log('using your system scheduler.');
  console.log('');

  const cliPath = 'wellness-journal';

  console.log(chalk.bold('macOS (launchd):'));
  console.log(chalk.gray('─'.repeat(30)));
  console.log('Create a file at:');
  console.log(chalk.blue('  ~/Library/LaunchAgents/com.wellness-journal.remind.plist'));
  console.log('');
  console.log(chalk.gray(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.wellness-journal.remind</string>
    <key>ProgramArguments</key>
    <array>
        <string>${cliPath}</string>
        <string>remind</string>
        <string>--silent</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <!-- Morning reminders: 7am, 8am, 9am -->
        <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
        <!-- Evening reminders: 8pm, 9pm -->
        <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>0</integer></dict>
    </array>
</dict>
</plist>`));
  console.log('');
  console.log('Then run:');
  console.log(chalk.cyan('  launchctl load ~/Library/LaunchAgents/com.wellness-journal.remind.plist'));
  console.log('');

  console.log(chalk.bold('Linux/Unix (cron):'));
  console.log(chalk.gray('─'.repeat(30)));
  console.log('Add to crontab (crontab -e):');
  console.log(chalk.gray(`
# Wellness Journal Reminders
# Morning: 7am, 8am, 9am
0 7,8,9 * * * ${cliPath} remind --silent
# Evening: 8pm, 9pm
0 20,21 * * * ${cliPath} remind --silent`));
  console.log('');
}
