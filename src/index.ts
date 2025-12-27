#!/usr/bin/env node
/**
 * Wellness Journal CLI
 *
 * A daily wellness journal integrating Whoop, Google Calendar,
 * and AI-powered reflections with Obsidian output.
 */

import { Command } from 'commander';
import chalk from 'chalk';

import { runSetup } from './commands/setup.js';
import { runMorning } from './commands/morning.js';
import { runEvening } from './commands/evening.js';
import { runStatus } from './commands/status.js';

const program = new Command();

program
  .name('wellness-journal')
  .description('Daily wellness journal with Whoop, Google Calendar, and AI reflections')
  .version('0.1.0');

program
  .command('setup')
  .description('Configure API integrations (Whoop, Google Calendar)')
  .action(async () => {
    try {
      await runSetup();
    } catch (error) {
      console.error(chalk.red('Setup failed:'), error);
      process.exit(1);
    }
  });

program
  .command('morning')
  .description('Run the morning check-in routine')
  .action(async () => {
    try {
      await runMorning();
    } catch (error) {
      console.error(chalk.red('Morning routine failed:'), error);
      process.exit(1);
    }
  });

program
  .command('evening')
  .description('Run the evening reflection routine')
  .action(async () => {
    try {
      await runEvening();
    } catch (error) {
      console.error(chalk.red('Evening routine failed:'), error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current configuration and stats')
  .action(async () => {
    try {
      await runStatus();
    } catch (error) {
      console.error(chalk.red('Status check failed:'), error);
      process.exit(1);
    }
  });

// Default command (no args) shows help with a friendly message
program
  .action(() => {
    console.log('');
    console.log(chalk.cyan.bold('🌅 Wellness Journal'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log('');
    console.log('A daily wellness journal integrating:');
    console.log('  • Whoop health metrics');
    console.log('  • Google Calendar events');
    console.log('  • AI-powered reflections');
    console.log('  • Obsidian daily notes');
    console.log('');
    console.log(chalk.bold('Quick Start:'));
    console.log(`  ${chalk.cyan('wellness-journal setup')}     Configure integrations`);
    console.log(`  ${chalk.cyan('wellness-journal morning')}   Morning check-in`);
    console.log(`  ${chalk.cyan('wellness-journal evening')}   Evening reflection`);
    console.log(`  ${chalk.cyan('wellness-journal status')}    View stats & config`);
    console.log('');
    program.outputHelp();
  });

program.parse();
