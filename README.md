# Wellness Journal

A personal wellness CLI that integrates **Whoop health metrics**, **Google Calendar**, and **Claude AI** to create a structured daily journaling practice with automatic **Obsidian** output.

## Why This Exists

Most wellness apps are passive — they show you data but don't help you *do* anything with it. This tool creates an active feedback loop:

1. **Morning**: See yesterday's biometrics → Reflect → Set one priority
2. **Evening** (optional): Did you accomplish it? → Gratitude → Note for tomorrow
3. **Weekly**: Pattern analysis → AI-powered coaching insights

All data stays local (SQLite + Obsidian markdown). No cloud sync, no subscriptions.

---

## Features

| Feature | Description |
|---------|-------------|
| **Whoop Integration** | Pulls recovery, HRV, sleep stages, strain, and workouts |
| **Google Calendar** | Shows today's schedule with meeting load analysis |
| **Claude AI Insights** | Personalized coaching based on your data and patterns |
| **Habit Tracking** | Track daily habits with completion rates and streaks |
| **Streak Gamification** | Visual streak counter with motivational messaging |
| **Weekly Reviews** | Auto-generated summaries with week-over-week trends |
| **Obsidian Notes** | Beautiful markdown daily/weekly notes with YAML frontmatter |
| **Smart Reminders** | Desktop notifications that open your terminal automatically |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/bflynn4141/wellness-journal.git
cd wellness-journal
npm install

# Configure integrations
cp .env.example .env
# Edit .env with your API credentials

# Build and link globally
npm run build
npm link

# Run setup wizard
wellness-journal setup

# Start your first check-in
wellness-journal morning
```

---

## Commands

### Daily Routines

```bash
# Morning check-in (8-10 min)
wellness-journal morning

# Evening reflection (3-5 min, optional)
wellness-journal evening
```

### Reviews & Status

```bash
# Weekly summary with AI analysis
wellness-journal weekly

# Dashboard: streak, habits, averages
wellness-journal status
```

### Reminders

```bash
# Check if reminder needed now
wellness-journal remind

# Setup automated daily reminders
wellness-journal remind --setup
```

---

## Morning Routine Flow

1. **Yesterday's Data** — Recovery %, HRV, sleep duration, strain score
2. **Today's Calendar** — Meetings, free blocks, schedule overview
3. **AI Coach Insights** — Personalized advice based on your metrics
4. **Reflection** — Energy, mood, what went well/challenging
5. **Yesterday's Habits** — Catch-up if you skipped evening check-in
6. **Intentions** — One priority, movement plan, success metric
7. **Morning Habits** — Quick checkbox for habits like meditation

If you run it again later, you'll see a summary of your entry instead of redoing everything.

---

## Configuration

Create a `.env` file:

```env
# Whoop API (https://developer.whoop.com)
WHOOP_CLIENT_ID=your_client_id
WHOOP_CLIENT_SECRET=your_client_secret

# Google Calendar (https://console.cloud.google.com)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Claude API - Optional (https://console.anthropic.com)
ANTHROPIC_API_KEY=your_api_key

# Obsidian vault path (optional, defaults shown)
OBSIDIAN_VAULT_PATH=~/Documents/Obsidian/Wellness-Journal
```

---

## Automated Reminders

The CLI can open your terminal and start the morning routine automatically at 8 AM.

### macOS (launchd)

```bash
# Show setup instructions
wellness-journal remind --setup

# Or manually create the plist at:
# ~/Library/LaunchAgents/com.wellness-journal.remind.plist
```

### Linux (cron)

```bash
# Add to crontab
0 8 * * * wellness-journal remind --silent
```

---

## Habit Tracking

Default habits (customizable in the database):

| Habit | Category | Emoji |
|-------|----------|-------|
| Meditation | Morning | 🧘 |
| Gratitude practice | Morning | 🙏 |
| Exercise | Anytime | 💪 |
| Read | Evening | 📚 |
| Journaled | Evening | ✍️ |
| No alcohol | Evening | 🍷 |
| No caffeine after 2pm | Evening | ☕ |
| 8+ hours sleep goal | Evening | 😴 |

Habits are logged per day and tracked in the status dashboard with completion percentages.

---

## Obsidian Integration

Each check-in generates a markdown file:

```
~/Documents/Obsidian/Wellness-Journal/
├── Daily/
│   ├── 2025-12-27.md
│   └── ...
└── Weekly/
    ├── 2025-W52.md
    └── ...
```

### YAML Frontmatter

Notes include structured frontmatter for Dataview queries:

```yaml
---
date: 2025-12-27
recovery_score: 78
hrv: 84
sleep_minutes: 454
energy_rating: 7
mood: calm_focused
tags: [daily, journal, wellness]
---
```

### Example Dataview Query

```dataview
TABLE recovery_score, energy_rating, mood
FROM "Daily"
WHERE date >= date(today) - dur(7 days)
SORT date DESC
```

---

## Data Storage

All data is stored locally:

| Data | Location |
|------|----------|
| Journal entries | `~/.wellness-journal/wellness.db` (SQLite) |
| OAuth tokens | `~/Library/Preferences/wellness-journal-nodejs/` (encrypted) |
| Obsidian notes | Your configured vault path |

No data leaves your machine except API calls to Whoop, Google, and Anthropic.

---

## Architecture

```
src/
├── index.ts              # CLI entry point (Commander)
├── config.ts             # Environment & credential management
├── types.ts              # TypeScript interfaces
├── db/
│   └── sqlite.ts         # SQLite with better-sqlite3
├── integrations/
│   ├── whoop.ts          # Whoop API v2 client
│   ├── calendar.ts       # Google Calendar client
│   └── claude.ts         # Anthropic Claude client
├── prompts/
│   ├── questions.ts      # Question definitions & helpers
│   └── engine.ts         # Interactive prompt flows
├── obsidian/
│   └── generator.ts      # Markdown note generation
├── commands/
│   ├── setup.ts          # Integration wizard
│   ├── morning.ts        # Morning routine
│   ├── evening.ts        # Evening routine
│   ├── weekly.ts         # Weekly review
│   ├── status.ts         # Dashboard
│   └── remind.ts         # Notification system
└── utils/
    └── auth.ts           # OAuth flow handling
```

---

## Development

```bash
# Development mode (with tsx)
npm run dev morning

# Build TypeScript
npm run build

# Type check
npm run typecheck
```

---

## Roadmap

- [x] Core daily routines (morning/evening)
- [x] Whoop + Google Calendar integration
- [x] Claude AI coaching insights
- [x] Habit tracking with streaks
- [x] Weekly reviews with pattern analysis
- [x] Automated desktop reminders
- [x] Obsidian daily/weekly notes
- [ ] Custom habit configuration via CLI
- [ ] Monthly summaries
- [ ] Export to CSV/JSON
- [ ] Web dashboard (maybe)

---

## License

MIT
