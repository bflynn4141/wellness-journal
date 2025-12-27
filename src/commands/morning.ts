/**
 * Morning Command
 *
 * Runs the morning check-in routine.
 */

import chalk from 'chalk';
import ora from 'ora';
import dayjs from 'dayjs';

import { runMorningRoutine } from '../prompts/engine.js';
import { saveDailyNote } from '../obsidian/generator.js';
import { initDatabase } from '../db/sqlite.js';

export async function runMorning(): Promise<void> {
  // Initialize database
  initDatabase();

  // Run the interactive morning routine
  await runMorningRoutine();

  // Generate Obsidian note
  const today = dayjs().format('YYYY-MM-DD');
  const spinner = ora('Generating Obsidian note...').start();

  try {
    const notePath = saveDailyNote(today);
    spinner.succeed(`Daily note saved: ${chalk.blue(notePath)}`);
  } catch (error) {
    spinner.fail('Failed to generate Obsidian note');
    console.error(error);
  }
}
