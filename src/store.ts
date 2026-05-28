import Conf from "conf";
import type { Task, RunLog } from "./types.js";
import { randomUUID } from "node:crypto";

const config = new Conf<{ tasks: Task[]; logs: RunLog[] }>({
  projectName: "cadence",
  defaults: { tasks: [], logs: [] },
});

export function getTasks(): Task[] {
  return config.get("tasks");
}

export function getTask(id: string): Task | undefined {
  return getTasks().find((t) => t.id === id);
}

export function addTask(
  task: Omit<Task, "id" | "createdAt" | "enabled">
): Task {
  const newTask: Task = {
    ...task,
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    enabled: true,
  };
  const tasks = getTasks();
  tasks.push(newTask);
  config.set("tasks", tasks);
  return newTask;
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const tasks = getTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...updates };
  config.set("tasks", tasks);
  return tasks[idx];
}

export function removeTask(id: string): boolean {
  const tasks = getTasks();
  const filtered = tasks.filter((t) => t.id !== id);
  if (filtered.length === tasks.length) return false;
  config.set("tasks", filtered);
  return true;
}

export function addLog(log: RunLog): void {
  const logs = config.get("logs");
  logs.push(log);
  // Keep last 200 logs
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  config.set("logs", logs);
}

export function getLogs(taskId?: string): RunLog[] {
  const logs = config.get("logs");
  if (taskId) return logs.filter((l) => l.taskId === taskId);
  return logs;
}

export function removeLog(taskId: string, timestamp: string): boolean {
  const logs = config.get("logs");
  const filtered = logs.filter(
    (l) => !(l.taskId === taskId && l.timestamp === timestamp)
  );
  if (filtered.length === logs.length) return false;
  config.set("logs", filtered);
  return true;
}
