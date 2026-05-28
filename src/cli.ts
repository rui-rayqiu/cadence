#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import * as readline from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { addTask, getTasks, removeTask, updateTask, getLogs } from "./store.js";
import { startScheduler } from "./scheduler.js";
import { runTask } from "./runner.js";
import { install, uninstall, status as serviceStatus, isRunning } from "./service.js";
import { analyzeRequest } from "./analyze.js";
import { describeSchedule } from "./schedule-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

program
  .name("cadence")
  .description("Schedule recurring Claude Code tasks — just describe what you want")
  .version("0.1.0")
  .argument("[request...]", "Describe what you want in plain English")
  .action(async (requestParts: string[]) => {
    const request = requestParts.join(" ").trim();

    if (!request) {
      showWelcome();
      return;
    }

    await createFromNaturalLanguage(request);
  });

program
  .command("list")
  .alias("ls")
  .description("List all tasks")
  .action(() => {
    const tasks = getTasks();
    if (tasks.length === 0) {
      console.log(chalk.dim("No tasks yet. Create one with: cadence \"check my email every hour\""));
      return;
    }
    console.log(chalk.bold(`\n  Tasks (${tasks.length}):\n`));
    for (const t of tasks) {
      const status = t.enabled ? chalk.green("●") : chalk.dim("○");
      const lastRun = t.lastRun
        ? chalk.dim(`Last run: ${new Date(t.lastRun).toLocaleString()}`)
        : chalk.dim("Never run");
      const mode = t.alertOnly ? chalk.yellow(" [alert-only]") : "";

      console.log(`  ${status} ${chalk.bold(t.name)} [${t.id}]${mode}`);
      console.log();
      console.log(chalk.dim(`    Schedule:  ${describeSchedule(t.schedule)}`));
      console.log(chalk.dim(`    Status:    ${lastRun}`));
      console.log();
      console.log(chalk.dim(`    Prompt:    "${t.prompt}"`));
      if (t.alertCondition) {
        console.log();
        console.log(chalk.dim(`    Alert when: ${t.alertCondition}`));
      }
      if (t.allowedTools?.length) {
        console.log();
        console.log(chalk.dim(`    Tools:     ${t.allowedTools.join(", ")}`));
      }
      if (t.workingDir) {
        console.log();
        console.log(chalk.dim(`    Directory: ${t.workingDir}`));
      }
      console.log();
      console.log(chalk.dim(`  ${"─".repeat(60)}`));
      console.log();
    }
  });

program
  .command("remove <id>")
  .alias("rm")
  .description("Remove a task")
  .action((id) => {
    if (removeTask(id)) {
      console.log(chalk.green(`✓ Task ${id} removed.`));
    } else {
      console.log(chalk.red(`Task ${id} not found.`));
    }
  });

program
  .command("enable <id>")
  .description("Enable a task")
  .action((id) => {
    const t = updateTask(id, { enabled: true });
    if (t) console.log(chalk.green(`✓ ${t.name} enabled.`));
    else console.log(chalk.red(`Task ${id} not found.`));
  });

program
  .command("disable <id>")
  .description("Disable a task")
  .action((id) => {
    const t = updateTask(id, { enabled: false });
    if (t) console.log(chalk.yellow(`○ ${t.name} disabled.`));
    else console.log(chalk.red(`Task ${id} not found.`));
  });

program
  .command("run [id]")
  .description("Run a task immediately (or all if no id)")
  .action(async (id) => {
    const tasks = getTasks().filter((t) => t.enabled);
    const toRun = id ? tasks.filter((t) => t.id === id) : tasks;

    if (toRun.length === 0) {
      console.log(chalk.dim("No matching tasks to run."));
      return;
    }

    for (const task of toRun) {
      console.log(chalk.blue(`\n  ▶ Running "${task.name}"...\n`));
      const log = await runTask(task);
      if (log.exitCode === 0) {
        console.log(chalk.green(`  ✓ Done in ${log.duration}ms`));
        if (log.stdout.trim()) {
          console.log();
          console.log(log.stdout.trim());
          console.log();
        }
      } else {
        console.log(chalk.red(`  ✗ Failed (exit ${log.exitCode})`));
        if (log.stderr.trim()) {
          console.log();
          console.log(chalk.red(log.stderr.trim()));
          console.log();
        }
      }
      console.log(chalk.dim(`  ${"─".repeat(60)}`));
    }
    console.log();
  });

program
  .command("logs [id]")
  .description("Show recent run logs")
  .option("-n, --limit <n>", "Number of logs to show", "10")
  .option("--full", "Show full output (no truncation)")
  .action((id, opts) => {
    const tasks = getTasks();
    const logs = getLogs(id).slice(-parseInt(opts.limit));
    if (logs.length === 0) {
      console.log(chalk.dim("No logs yet."));
      return;
    }
    const maxLines = opts.full ? Infinity : 15;
    console.log();
    for (const log of logs) {
      const task = tasks.find((t) => t.id === log.taskId);
      const name = task?.name ?? log.taskId;
      const icon = log.exitCode === 0
        ? (log.alerted ? chalk.yellow("🔔") : chalk.green("✓"))
        : chalk.red("✗");
      const time = new Date(log.timestamp).toLocaleString();

      console.log(`  ${icon} ${chalk.bold(name)}`);
      console.log(chalk.dim(`    ${time} · ${log.duration}ms`));

      if (log.exitCode !== 0 && log.stderr.trim()) {
        console.log();
        console.log(chalk.red(`    Error: ${log.stderr.trim().split("\n")[0]}`));
      }

      if (log.stdout.trim()) {
        console.log();
        const allLines = log.stdout.trim().split("\n");
        const lines = allLines.slice(0, maxLines);
        for (const line of lines) {
          console.log(chalk.dim(`    ${line}`));
        }
        if (allLines.length > maxLines) {
          console.log();
          console.log(chalk.dim(`    ... (${allLines.length - maxLines} more lines, use --full to see all)`));
        }
      }

      console.log();
      console.log(chalk.dim(`  ${"─".repeat(60)}`));
      console.log();
    }
  });

program
  .command("start")
  .description("Start the scheduler (foreground)")
  .action(() => {
    startScheduler();
  });

program
  .command("ui")
  .description("Open the web dashboard")
  .option("-p, --port <port>", "Port for the web UI", "4778")
  .action(async (opts) => {
    const { createApi, startSchedulerInApi } = await import("./api.js");
    const { execSync } = await import("node:child_process");
    const app = createApi();
    startSchedulerInApi();
    const port = parseInt(opts.port);
    app.listen(port, "127.0.0.1", () => {
      console.log(chalk.bold(`\n  Cadence UI running at http://localhost:${port}`));
      console.log(chalk.dim(`  Scheduler active. Tasks will run on schedule.\n`));
      const openCmd = process.platform === "darwin" ? "open" : process.platform === "linux" ? "xdg-open" : null;
      if (openCmd) { try { execSync(`${openCmd} http://localhost:${port}`); } catch {} }
    });
  });

program
  .command("install")
  .description("Install as a macOS background service (auto-starts on login)")
  .action(() => {
    const projectDir = resolve(__dirname, "..");
    install(projectDir);
  });

program
  .command("uninstall")
  .description("Remove the macOS background service")
  .action(() => {
    uninstall();
  });

program
  .command("status")
  .description("Dashboard — service, tasks, recent activity")
  .action(() => {
    showDashboard();
  });

program.parse();

async function createFromNaturalLanguage(request: string): Promise<void> {
  console.log(chalk.dim("\n  Analyzing your request with Claude...\n"));

  let config;
  try {
    config = await analyzeRequest(request);
  } catch (err: any) {
    console.log(chalk.red(`  Error: ${err.message}`));
    console.log(chalk.dim("  Make sure Claude Code is installed and authenticated."));
    return;
  }

  console.log(chalk.bold("  Here's what I'll set up:\n"));

  console.log(`  Name:      ${chalk.bold(config.name)}`);
  console.log();
  console.log(`  Schedule:  ${chalk.bold(describeSchedule(config.schedule))} ${chalk.dim(`(${config.schedule})`)}`);
  console.log();
  console.log(`  Prompt:    ${chalk.dim(`"${config.prompt}"`)}`);
  console.log();
  if (config.alertOnly) {
    console.log(`  Mode:      ${chalk.yellow("Alert-only")} — notify when: ${config.alertCondition}`);
    console.log();
  } else {
    console.log(`  Mode:      ${chalk.green("Always notify")}`);
    console.log();
  }
  if (config.allowedTools.length) {
    console.log(`  Tools:     ${config.allowedTools.join(", ")}`);
    console.log();
  }
  if (config.workingDir) {
    console.log(`  Directory: ${config.workingDir}`);
    console.log();
  }

  const confirmed = await confirm("  Create this task?");

  if (!confirmed) {
    console.log(chalk.dim("\n  Cancelled.\n"));
    return;
  }

  const task = addTask({
    name: config.name,
    prompt: config.prompt,
    schedule: config.schedule,
    notify: true,
    alertOnly: config.alertOnly,
    alertCondition: config.alertOnly ? config.alertCondition : undefined,
    allowedTools: config.allowedTools.length > 0 ? config.allowedTools : undefined,
    workingDir: config.workingDir,
  });

  console.log(chalk.green(`\n  ✓ Task created: ${task.name} [${task.id}]`));
  if (config.allowedTools.length > 0) {
    console.log(chalk.dim(`    Tools granted per-run: ${config.allowedTools.join(", ")}`));
  }
  console.log(chalk.dim(`\n  Next steps:`));
  console.log(chalk.dim(`    cadence start    — run scheduler in this terminal`));
  console.log(chalk.dim(`    cadence install  — run as background service`));
  console.log(chalk.dim(`    cadence run ${task.id}  — test it now\n`));
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} ${chalk.dim("[Y/n]")} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== "n");
    });
  });
}

function showWelcome(): void {
  console.log(chalk.bold("\n  Cadence") + chalk.dim(" — schedule recurring Claude Code tasks\n"));
  console.log("  Just describe what you want:\n");
  console.log(chalk.dim(`    $ ${chalk.reset("cadence \"check my email every 2 hours for messages from recruiters\"")}`));
  console.log(chalk.dim(`    $ ${chalk.reset("cadence \"every morning, summarize my open PRs on github\"")}`));
  console.log(chalk.dim(`    $ ${chalk.reset("cadence \"alert me if npm audit finds critical vulnerabilities, check daily\"")}`));
  console.log();
  console.log("  Other commands:\n");
  console.log(`    ${chalk.bold("cadence list")}       Show all tasks`);
  console.log(`    ${chalk.bold("cadence status")}     Dashboard`);
  console.log(`    ${chalk.bold("cadence run")}        Run tasks now`);
  console.log(`    ${chalk.bold("cadence start")}      Start the scheduler`);
  console.log(`    ${chalk.bold("cadence install")}    Run as background service`);
  console.log(`    ${chalk.bold("cadence --help")}     All commands\n`);
}

function showDashboard(): void {
  const tasks = getTasks();
  const logs = getLogs();
  const service = isRunning();

  console.log(chalk.bold("\n  Scheduler\n"));
  if (service.running) {
    console.log(`  ${chalk.green("●")} Running (PID ${service.pid})`);
  } else if (service.installed) {
    console.log(`  ${chalk.yellow("○")} Installed but not running`);
  } else {
    console.log(`  ${chalk.dim("○")} Not running`);
  }

  console.log();
  console.log(chalk.dim(`  ${"─".repeat(60)}`));

  console.log(chalk.bold("\n  Tasks\n"));
  if (tasks.length === 0) {
    console.log(chalk.dim("  No tasks configured."));
  } else {
    const enabled = tasks.filter((t) => t.enabled).length;
    const disabled = tasks.length - enabled;
    console.log(`  ${enabled} active${disabled > 0 ? `, ${disabled} disabled` : ""}\n`);
    for (const t of tasks) {
      const icon = t.enabled ? chalk.green("●") : chalk.dim("○");
      const lastInfo = t.lastRun
        ? `${t.lastResult === "success" ? chalk.green("✓") : chalk.red("✗")} ${timeAgo(t.lastRun)}`
        : chalk.dim("never run");
      console.log(`  ${icon} ${chalk.bold(t.name)} [${t.id}] — ${lastInfo}`);
    }
  }

  console.log();
  console.log(chalk.dim(`  ${"─".repeat(60)}`));

  console.log(chalk.bold("\n  Recent Activity\n"));
  const recent = logs.slice(-5);
  if (recent.length === 0) {
    console.log(chalk.dim("  No runs yet."));
  } else {
    for (const log of recent.reverse()) {
      const icon = log.exitCode === 0
        ? (log.alerted ? chalk.yellow("🔔") : chalk.green("✓"))
        : chalk.red("✗");
      const task = tasks.find((t) => t.id === log.taskId);
      const name = task?.name ?? log.taskId;
      console.log(`  ${icon} ${name} — ${timeAgo(log.timestamp)} (${log.duration}ms)`);
      console.log();
    }
  }

  console.log();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
