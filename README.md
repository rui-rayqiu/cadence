# Cadence

Schedule recurring Claude Code tasks — just describe what you want in plain English.

## Install

```bash
git clone https://github.com/rui-rayqiu/cadence.git
cd cadence
npm install
cd web && npm install && cd ..
npm run build
npm link  # makes `cadence` available globally
```

## Quick start

```bash
cadence "check my email every 2 hours for messages from recruiters"
```

That's it. Claude figures out the schedule, prompt, tools, and permissions. You confirm, then start the scheduler.

---

## CLI usage

### Create a task

Just describe what you want. Claude handles the rest:

```bash
cadence "every morning at 9am summarize my open PRs on github"
cadence "alert me if npm audit finds critical vulnerabilities, check daily"
cadence "every weekday at 5pm remind me to submit my timesheet"
cadence "every 30 minutes check slack for messages mentioning me"
cadence "every hour run tests in ~/projects/my-app and alert me if any fail"
```

What happens:
1. Claude discovers what tools are available on your system
2. Claude analyzes your request and determines: schedule, prompt, tools needed, alert mode, and working directory
3. You see a summary and confirm with `y`
4. Task is saved

You can specify a working directory in natural language:
```bash
cadence "daily at 9am run npm audit in ~/projects/my-app"
```

### Manage tasks

```bash
cadence list           # show all tasks with status
cadence run            # test all tasks now (one-time, doesn't affect schedule)
cadence run <id>       # test one task now
cadence disable <id>   # pause a task
cadence enable <id>    # resume a task
cadence rm <id>        # delete a task
```

### View logs

```bash
cadence logs           # recent run history (15 lines per entry)
cadence logs <id>      # logs for one task
cadence logs -n 20     # show last 20 entries
cadence logs --full    # show full output, no truncation
```

### Start the scheduler

Tasks don't run automatically until you start the scheduler:

```bash
# Option 1: run in your terminal (see output live)
cadence start

# Option 2: install as macOS background service (survives reboots, auto-starts on login)
cadence install

# Check scheduler status + task summary + recent activity
cadence status

# Remove the background service
cadence uninstall
```

---

## Web UI

```bash
cadence ui
```

This starts both the scheduler and a local web dashboard at `http://localhost:4778`. Your browser opens automatically.

### What you can do in the UI

- **Create tasks** — same natural language input as CLI, type in the text box and hit Enter
- **Start/stop scheduler** — click the badge in the top right
- **Test tasks** — "⚡ Test once" button runs a task immediately (one-time, doesn't affect the schedule)
- **Enable/disable tasks** — toggle without deleting
- **Delete tasks** — with confirmation
- **View logs** — full Claude output rendered as markdown (tables, bold, lists, code blocks)
- **Expand/collapse** — long outputs and task descriptions have "Show more" / "Show less"
- **Delete individual logs** — × button on each log entry

### UI notes

- The scheduler starts automatically when you run `cadence ui`
- If you have tasks but the scheduler isn't running, a warning banner appears
- Task creation takes 15-30 seconds (two Claude calls) — a progress indicator shows what's happening
- Press Enter to submit, Shift+Enter for a new line in the input box

---

## How it works

1. You describe a task in plain English (CLI or web UI)
2. Cadence calls Claude Code to discover your available tools
3. Cadence calls Claude Code again to analyze your request → outputs a structured config (schedule, prompt, tools, alert mode, working directory)
4. You confirm
5. Task is saved locally
6. When the scheduler runs, each task executes: `claude -p "prompt" --allowedTools tool1 tool2`
7. Tools are granted per-run only — each task only gets what it needs, nothing is changed globally
8. For alert-only tasks, Claude's response must start with `ALERT:` or `NOTHING:` — you only get notified on alerts
9. Notifications pop up via macOS native notifications

---

## Data locations

### macOS

| What | Path |
|---|---|
| Tasks & run logs | `~/Library/Preferences/cadence-nodejs/config.json` |
| Scheduler log | `~/.cadence/scheduler.log` |
| Scheduler errors | `~/.cadence/scheduler.err` |
| Background service | `~/Library/LaunchAgents/com.cadence.scheduler.plist` |

### Linux

| What | Path |
|---|---|
| Tasks & run logs | `~/.config/cadence-nodejs/config.json` |
| Scheduler log | `~/.cadence/scheduler.log` |
| Scheduler errors | `~/.cadence/scheduler.err` |
| Background service | `~/.config/systemd/user/cadence.service` |

### Reset everything

```bash
cadence uninstall

# macOS
rm -rf ~/Library/Preferences/cadence-nodejs
rm -rf ~/.cadence

# Linux
rm -rf ~/.config/cadence-nodejs
rm -rf ~/.cadence
```

---

## All commands

| Command | Description |
|---|---|
| `cadence "..."` | Create a task from natural language |
| `cadence list` | Show all tasks |
| `cadence run [id]` | Test a task now (one-time) |
| `cadence enable <id>` | Enable a paused task |
| `cadence disable <id>` | Pause a task |
| `cadence rm <id>` | Delete a task |
| `cadence logs [id]` | Show run history |
| `cadence start` | Start scheduler in foreground |
| `cadence install` | Install as background service |
| `cadence uninstall` | Remove background service |
| `cadence status` | Dashboard (service + tasks + activity) |
| `cadence ui` | Web dashboard + scheduler |
| `cadence --help` | Show help |

---

## Requirements

- Node.js 18+
- Claude Code CLI (`claude`) installed and authenticated
- macOS (for notifications and background service; the scheduler itself works on any OS)
