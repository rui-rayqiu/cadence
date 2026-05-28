# Contributing to Cadence

## Project structure

```
cadence/
├── src/              # CLI + backend (TypeScript, compiled to dist/)
│   ├── cli.ts        # CLI entry point + commands
│   ├── api.ts        # Express API for the web UI
│   ├── analyze.ts    # Calls Claude to parse natural language → task config
│   ├── runner.ts     # Executes tasks by shelling out to `claude`
│   ├── scheduler.ts  # Cron-based scheduler (croner)
│   ├── store.ts      # Persistent task/log storage (conf)
│   ├── service.ts    # Background service install (launchd / systemd)
│   ├── notify.ts     # OS notifications
│   └── schedule-parser.ts  # Human-readable schedule display
├── web/              # React web UI (separate package.json)
│   ├── src/
│   │   ├── App.tsx   # Main UI component
│   │   ├── api.ts    # Frontend API client
│   │   └── styles.css
│   └── vite.config.ts
├── package.json      # Backend dependencies + build scripts
└── tsconfig.json     # Backend TypeScript config
```

## Setup

```bash
git clone https://github.com/rui-rayqiu/cadence.git
cd cadence

# Install backend dependencies
npm install

# Install web UI dependencies
cd web && npm install && cd ..

# Build everything
npm run build
```

## Development

### CLI development

```bash
# Run CLI commands directly without building
npm run dev -- "your command here"
npm run dev -- list
npm run dev -- status
```

### Web UI development

You need two terminals:

```bash
# Terminal 1: start the API server
npm run dev -- ui

# Terminal 2: start Vite dev server with hot reload
npm run dev:web
```

The Vite dev server runs on port 4779 and proxies `/api` requests to the API server on port 4778.

### Building

```bash
npm run build          # builds both server + web
npm run build:server   # server only
npm run build:web      # web UI only
```

## Architecture notes

- The CLI and web UI share the same backend code (store, runner, scheduler)
- `cadence ui` starts both the API server AND the scheduler in one process
- `cadence start` runs the scheduler only (no web UI)
- `cadence install` sets up a system service that runs `cadence start`
- Task config is stored via the `conf` package (JSON file in OS-specific config dir)
- Each task execution shells out to `claude -p "..." --allowedTools ...`

## Platform support

- **macOS**: notifications via osascript, background service via launchd
- **Linux**: notifications via notify-send, background service via systemd user units
- **Windows**: scheduler and web UI work, but no background service or notifications (PRs welcome)
