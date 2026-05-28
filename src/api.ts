import express from "express";
import cors from "cors";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { getTasks, removeTask, updateTask, getLogs, removeLog } from "./store.js";
import { runTask } from "./runner.js";
import { analyzeRequest } from "./analyze.js";
import { addTask } from "./store.js";
import { isRunning } from "./service.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import { describeSchedule } from "./schedule-parser.js";

let schedulerActive = false;

export function startSchedulerInApi() {
  if (!schedulerActive) {
    startScheduler();
    schedulerActive = true;
  }
}

export function createApi() {
  const app = express();
  app.use(cors({ origin: ["http://localhost:4778", "http://localhost:4779", "http://127.0.0.1:4778"] }));
  app.use(express.json());

  app.get("/api/status", (_req, res) => {
    const tasks = getTasks();
    const logs = getLogs();
    const service = isRunning();
    const recent = logs.slice(-10).reverse();

    res.json({
      service,
      schedulerActive,
      tasks: tasks.map((t) => ({
        ...t,
        scheduleHuman: describeSchedule(t.schedule),
      })),
      recentLogs: recent,
    });
  });

  app.post("/api/scheduler/start", (_req, res) => {
    if (!schedulerActive) {
      startScheduler();
      schedulerActive = true;
    }
    res.json({ running: true });
  });

  app.post("/api/scheduler/stop", (_req, res) => {
    if (schedulerActive) {
      stopScheduler();
      schedulerActive = false;
    }
    res.json({ running: false });
  });

  app.get("/api/tasks", (_req, res) => {
    const tasks = getTasks().map((t) => ({
      ...t,
      scheduleHuman: describeSchedule(t.schedule),
    }));
    res.json(tasks);
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const removed = removeTask(req.params.id);
    res.json({ ok: removed });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const task = updateTask(req.params.id, req.body);
    if (task) res.json(task);
    else res.status(404).json({ error: "Task not found" });
  });

  app.post("/api/tasks/:id/run", async (req, res) => {
    const tasks = getTasks();
    const task = tasks.find((t) => t.id === req.params.id);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    const log = await runTask(task);
    res.json(log);
  });

  app.get("/api/logs", (req, res) => {
    const taskId = req.query.taskId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const logs = getLogs(taskId).slice(-limit).reverse();
    res.json(logs);
  });

  app.delete("/api/logs", (req, res) => {
    const { taskId, timestamp } = req.body;
    if (!taskId || !timestamp) { res.status(400).json({ error: "taskId and timestamp required" }); return; }
    const removed = removeLog(taskId, timestamp);
    res.json({ ok: removed });
  });

  app.post("/api/analyze", async (req, res) => {
    const { request } = req.body;
    if (!request) { res.status(400).json({ error: "request is required" }); return; }
    try {
      const config = await analyzeRequest(request);
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tasks", (req, res) => {
    const { name, prompt, schedule, alertOnly, alertCondition, allowedTools, workingDir } = req.body;
    if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
    if (!prompt || typeof prompt !== "string") { res.status(400).json({ error: "prompt is required" }); return; }
    if (!schedule || typeof schedule !== "string") { res.status(400).json({ error: "schedule is required" }); return; }
    const task = addTask({
      name,
      prompt,
      schedule,
      notify: true,
      alertOnly: alertOnly || false,
      alertCondition,
      allowedTools,
      workingDir,
    });
    res.json(task);
  });

  const webDir = resolve(process.cwd(), "dist", "web");
  const indexHtml = resolve(webDir, "index.html");
  if (existsSync(indexHtml)) {
    app.get("/", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexHtml);
    });
    app.use("/assets", express.static(resolve(webDir, "assets"), { maxAge: 0 }));
  }

  return app;
}
