import { execFile } from "node:child_process";
import type { Task } from "./types.js";

export interface AnalyzedTask {
  name: string;
  prompt: string;
  schedule: string;
  alertOnly: boolean;
  alertCondition?: string;
  allowedTools: string[];
  workingDir?: string;
}

function discoverTools(): Promise<string> {
  return new Promise((resolve) => {
    execFile("claude", ["-p", "List all tools available to you. Output ONLY the tool names, one per line, no descriptions or formatting.", "--output-format", "text"], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve("Bash, Read, Write, WebFetch");
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function buildAnalysisPrompt(availableTools: string): string {
  return `You are a task configuration assistant. The user wants to schedule a recurring task that runs with Claude Code.

Analyze their request and output ONLY valid JSON (no markdown, no explanation, no code fences) with these fields:

{
  "name": "short-kebab-case-name",
  "prompt": "the full prompt to send to Claude Code each time the task runs — be specific and actionable",
  "schedule": "cron expression (5 fields: min hour dom month dow)",
  "alertOnly": true/false (true if user only wants to be notified when something specific happens, false if they want output every time),
  "alertCondition": "condition that triggers notification (only if alertOnly is true, otherwise null)",
  "allowedTools": ["list", "of", "tool", "names"] (pick from the available tools below),
  "workingDir": "/absolute/path/or/null" (directory where the task should run — extract from the user's request if they mention a project, folder, or path; null if not specified)
}

AVAILABLE TOOLS ON THIS SYSTEM:
${availableTools}

Guidelines for the schedule:
- "every few hours" → 0 */3 * * *
- "every couple hours" → 0 */2 * * *
- "every morning" → 0 9 * * *
- "a few times a day" → 0 9,13,17 * * *
- "every weekday morning" → 0 9 * * 1-5
- "every 30 min" → */30 * * * *
- "once a day" → 0 9 * * *
- "twice a day" → 0 9,17 * * *

Guidelines for alertOnly:
- If the user says "let me know IF...", "alert me WHEN...", "notify me ONLY if..." → alertOnly: true
- If the user wants a report/summary every time → alertOnly: false

Guidelines for the prompt:
- Write it as a clear instruction to Claude Code
- Include specifics from the user's request (keywords, names, repos, etc.)
- Make it self-contained — Claude Code won't have context from this conversation

Guidelines for allowedTools:
- Only include tools that are actually needed for the task
- Pick the minimum set — don't over-grant
- Use exact tool names from the list above

Guidelines for workingDir:
- If the user mentions a specific directory, folder, or project path (e.g. "in ~/projects/my-app", "in the my-app repo", "for /Users/bob/work"), set workingDir to that absolute path
- Expand ~ to the home directory
- If no directory is mentioned, set to null

USER REQUEST: `;
}

export async function analyzeRequest(userInput: string): Promise<AnalyzedTask> {
  const availableTools = await discoverTools();

  return new Promise((resolve, reject) => {
    const fullPrompt = buildAnalysisPrompt(availableTools) + userInput;

    execFile("claude", ["-p", fullPrompt, "--output-format", "text"], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Claude analysis failed: ${stderr || error.message}`));
        return;
      }

      try {
        const cleaned = stdout.trim()
          .replace(/^```json?\n?/m, "")
          .replace(/\n?```$/m, "")
          .trim();
        const parsed = JSON.parse(cleaned) as AnalyzedTask;

        if (!parsed.name || !parsed.prompt || !parsed.schedule) {
          reject(new Error("Claude returned incomplete configuration"));
          return;
        }

        resolve(parsed);
      } catch (e) {
        reject(new Error(`Could not parse Claude's response: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

export function tweakTask(task: Task, modification: string): Promise<AnalyzedTask> {
  const prompt = `You are modifying an existing scheduled task. Here is the current configuration:

{
  "name": "${task.name}",
  "prompt": ${JSON.stringify(task.prompt)},
  "schedule": "${task.schedule}",
  "alertOnly": ${task.alertOnly ?? false},
  "alertCondition": ${JSON.stringify(task.alertCondition ?? null)},
  "allowedTools": ${JSON.stringify(task.allowedTools ?? [])},
  "workingDir": ${JSON.stringify(task.workingDir ?? null)}
}

The user wants to make this change: "${modification}"

Apply ONLY the requested change. Keep everything else the same unless the change logically requires updating other fields (e.g. changing what the task does may require different tools).

Output ONLY valid JSON (no markdown, no explanation, no code fences) with the updated configuration using the same fields as above.`;

  return new Promise((resolve, reject) => {
    execFile("claude", ["-p", prompt, "--output-format", "text"], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Claude modification failed: ${stderr || error.message}`));
        return;
      }

      try {
        const cleaned = stdout.trim()
          .replace(/^```json?\n?/m, "")
          .replace(/\n?```$/m, "")
          .trim();
        const parsed = JSON.parse(cleaned) as AnalyzedTask;

        if (!parsed.name || !parsed.prompt || !parsed.schedule) {
          reject(new Error("Claude returned incomplete configuration"));
          return;
        }

        resolve(parsed);
      } catch (e) {
        reject(new Error(`Could not parse Claude's response: ${stdout.slice(0, 200)}`));
      }
    });
  });
}
