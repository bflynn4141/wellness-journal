/**
 * Evening Command
 *
 * Runs the evening reflection routine.
 */

import chalk from 'chalk';
import ora from 'ora';
import dayjs from 'dayjs';

import { runEveningRoutine } from '../prompts/engine.js';
import { saveDailyNote } from '../obsidian/generator.js';
import { initDatabase } from '../db/sqlite.js';

export async function runEvening(): Promise<void> {
  // Initialize database
  initDatabase();

  // Run the interactive evening routine
  await runEveningRoutine();

  // Update Obsidian note
  const today = dayjs().format('YYYY-MM-DD');
  const spinner = ora('Updating Obsidian note...').start();

  try {
    const notePath = saveDailyNote(today);
    spinner.succeed(`Daily note updated: ${chalk.blue(notePath)}`);
  } catch (error) {
    spinner.fail('Failed to update Obsidian note');
    console.error(error);
  }
}
