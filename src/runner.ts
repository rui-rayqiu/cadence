import { spawn } from "node:child_process";
import type { Task, RunLog } from "./types.js";
import { addLog, updateTask } from "./store.js";
import { notify } from "./notify.js";

export function runTask(task: Task): Promise<RunLog> {
  const start = Date.now();

  const prompt = buildPrompt(task);

  return new Promise((resolve) => {
    const args = ["-p", prompt, "--output-format", "text"];

    if (task.allowedTools && task.allowedTools.length > 0) {
      for (const tool of task.allowedTools) {
        args.push("--allowedTools", tool);
      }
    }

    const proc = spawn("claude", args, {
      cwd: task.workingDir || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 600_000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 10000) stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 5000) stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      const log: RunLog = {
        taskId: task.id,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        exitCode: code ?? 0,
        stdout: stdout.slice(0, 10000),
        stderr: stderr.slice(0, 5000),
      };

      const result = log.exitCode === 0 ? "success" : "error";
      const shouldAlert = checkAlert(task, log);
      log.alerted = shouldAlert;

      if (shouldAlert && task.notify) {
        const preview = log.stdout.trim().split("\n").slice(0, 2).join(" ");
        notify(`Cadence: ${task.name}`, preview || "Task completed with alert");
      }

      updateTask(task.id, { lastRun: log.timestamp, lastResult: result });
      addLog(log);
      resolve(log);
    });
  });
}

function buildPrompt(task: Task): string {
  if (!task.alertOnly || !task.alertCondition) {
    return task.prompt;
  }

  return `${task.prompt}

IMPORTANT: After completing the above, evaluate whether the following condition is met: "${task.alertCondition}"

Your response MUST start with either "ALERT:" or "NOTHING:" on the first line.
- Start with "ALERT:" followed by relevant details if the condition IS met.
- Start with "NOTHING:" followed by a brief summary if the condition is NOT met.`;
}

function checkAlert(task: Task, log: RunLog): boolean {
  if (!task.alertOnly) return log.exitCode === 0;
  return log.stdout.trimStart().startsWith("ALERT:");
}
