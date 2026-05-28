import { Cron } from "croner";
import { getTasks } from "./store.js";
import { runTask } from "./runner.js";
import chalk from "chalk";

const jobs = new Map<string, Cron>();

export function startScheduler(): void {
  const tasks = getTasks().filter((t) => t.enabled);

  for (const task of tasks) {
    scheduleTask(task.id, task.schedule, task.name);
  }

  console.log(
    chalk.green(`Cadence running with ${tasks.length} active task(s).`)
  );
  console.log(chalk.dim("Press Ctrl+C to stop.\n"));

  for (const task of tasks) {
    const job = jobs.get(task.id);
    const next = job?.nextRun();
    console.log(
      `  ${chalk.bold(task.name)} [${task.id}] → next: ${next?.toLocaleString() ?? "unknown"}`
    );
  }
}

function scheduleTask(id: string, cron: string, name: string): void {
  const job = new Cron(cron, async () => {
    const tasks = getTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task || !task.enabled) return;

    console.log(
      `\n${chalk.blue("▶")} Running "${name}" at ${new Date().toLocaleTimeString()}`
    );

    const log = await runTask(task);

    if (log.exitCode === 0) {
      if (task.alertOnly && !log.alerted) {
        console.log(chalk.dim(`  · Nothing new (${log.duration}ms)`));
      } else {
        console.log(chalk.green(`  ✓ Done in ${log.duration}ms`));
        if (log.alerted) console.log(chalk.yellow(`  🔔 Alert triggered!`));
        if (log.stdout.trim()) {
          const preview = log.stdout.trim().split("\n").slice(0, 3).join("\n");
          console.log(chalk.dim(`  ${preview}`));
        }
      }
    } else {
      console.log(chalk.red(`  ✗ Failed (exit ${log.exitCode})`));
      if (log.stderr.trim()) {
        console.log(chalk.red(`  ${log.stderr.trim().split("\n")[0]}`));
      }
    }
  });

  jobs.set(id, job);
}

export function stopScheduler(): void {
  for (const [, job] of jobs) {
    job.stop();
  }
  jobs.clear();
}
