# Wellness Journal

A daily wellness journal CLI that integrates Whoop health metrics, Google Calendar, and AI-powered reflections, outputting beautiful daily notes to Obsidian.

## Features

- 📊 **Whoop Integration**: Automatically pulls recovery, HRV, sleep, and strain data
- 📅 **Google Calendar**: Shows today's schedule and free time blocks
- 🪞 **Structured Reflections**: Consistent questions for longitudinal pattern analysis
- 🎯 **Intention Setting**: Daily priority and success metrics
- 📝 **Obsidian Output**: Beautiful markdown daily notes with YAML frontmatter
- 📈 **Pattern Detection**: Tracks trends and correlations over time
- 🤖 **AI Insights** (coming soon): Claude-powered pattern analysis

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/wellness-journal.git
cd wellness-journal

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Run setup
npm run setup
```

## Configuration

Create a `.env` file with:

```env
# Whoop API (https://developer.whoop.com)
WHOOP_CLIENT_ID=your_client_id
WHOOP_CLIENT_SECRET=your_client_secret

# Google Calendar (https://console.cloud.google.com)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Claude API - Optional (https://console.anthropic.com)
ANTHROPIC_API_KEY=your_api_key

# Obsidian vault path
OBSIDIAN_VAULT_PATH=~/Documents/Obsidian/MyVault
```

## Usage

### Morning Routine

```bash
npm run morning
# or
wellness-journal morning
```

The morning routine:
1. Pulls yesterday's Whoop data (recovery, sleep, strain)
2. Shows today's calendar
3. Asks reflection questions
4. Sets daily intentions
5. Saves to database and generates Obsidian note

### Evening Routine

```bash
npm run evening
# or
wellness-journal evening
```

### Check Status

```bash
wellness-journal status
```

### Setup Integrations

```bash
npm run setup
# or
wellness-journal setup
```

## Daily Note Output

Each day generates a markdown file in your Obsidian vault:

```
~/Obsidian/Wellness-Journal/Daily/2025-01-15.md
```

With YAML frontmatter for Dataview queries:

```yaml
---
date: 2025-01-15
recovery_score: 78
hrv: 84
energy_rating: 7
mood: calm_focused
tags: [daily, journal, wellness]
---
```

## Question Framework

### Core Questions (always asked)
- Energy rating (1-10)
- Mood baseline
- Sleep reflection
- Yesterday's win
- Yesterday's challenge
- #1 priority for today
- Movement intention
- Success metric

### Dynamic Questions
Generated based on:
- Low recovery days
- HRV trends
- Sleep patterns
- Day of week (weekend vs weekday)
- High strain follow-ups

## Development

```bash
# Run in development mode
npm run dev morning

# Build
npm run build

# Type check
npm run typecheck
```

## Architecture

```
src/
├── index.ts           # CLI entry point
├── config.ts          # Configuration management
├── types.ts           # TypeScript types
├── db/
│   └── sqlite.ts      # SQLite database layer
├── integrations/
│   ├── whoop.ts       # Whoop API client
│   └── calendar.ts    # Google Calendar client
├── prompts/
│   ├── questions.ts   # Question definitions
│   └── engine.ts      # CLI prompt flow
├── obsidian/
│   └── generator.ts   # Markdown generator
├── commands/
│   ├── setup.ts       # Setup wizard
│   ├── morning.ts     # Morning routine
│   ├── evening.ts     # Evening routine
│   └── status.ts      # Status display
└── utils/
    └── auth.ts        # OAuth utilities
```

## Roadmap

- [x] Phase 1: Core functionality (Whoop, Calendar, Obsidian)
- [ ] Phase 2: Claude AI integration for pattern analysis
- [ ] Phase 3: Weekly/monthly summaries
- [ ] Phase 4: Web interface

## License

MIT
