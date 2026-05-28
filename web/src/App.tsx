import { useState, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as api from "./api";

interface Task {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  scheduleHuman: string;
  enabled: boolean;
  lastRun?: string;
  lastResult?: string;
  alertOnly?: boolean;
  alertCondition?: string;
  allowedTools?: string[];
}

interface LogEntry {
  taskId: string;
  timestamp: string;
  duration: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  alerted?: boolean;
}

interface AnalyzedConfig {
  name: string;
  prompt: string;
  schedule: string;
  alertOnly: boolean;
  alertCondition?: string;
  allowedTools: string[];
  workingDir?: string;
}

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [input, setInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState("");
  const [preview, setPreview] = useState<AnalyzedConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [editPreview, setEditPreview] = useState<{ taskId: string; config: AnalyzedConfig } | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const status = await api.fetchStatus();
      setTasks(status.tasks);
      setLogs(status.recentLogs);
      setSchedulerRunning(status.schedulerActive || status.service.running);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || analyzing) return;
    setAnalyzing(true);
    setAnalyzeStep("Discovering available tools...");
    try {
      // Small delay so user sees first step
      setTimeout(() => setAnalyzeStep("Claude is analyzing your request..."), 3000);
      const config = await api.analyzeRequest(input.trim());
      setPreview(config);
    } catch (err: any) {
      if (err.message === "Failed to fetch") {
        alert("Cannot reach the Cadence server. Make sure `cadence ui` is running.");
      } else {
        alert(`Error: ${err.message}`);
      }
    }
    setAnalyzing(false);
    setAnalyzeStep("");
  }

  async function confirmCreate() {
    if (!preview) return;
    setCreating(true);
    await api.createTask(preview);
    setPreview(null);
    setInput("");
    setCreating(false);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    await api.deleteTask(id);
    refresh();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await api.toggleTask(id, enabled);
    refresh();
  }

  async function handleRun(id: string) {
    setRunningTask(id);
    await api.runTaskNow(id);
    setRunningTask(null);
    refresh();
  }

  async function handleEditSubmit(taskId: string) {
    if (!editInput.trim()) return;
    setEditLoading(true);
    try {
      const config = await api.editTask(taskId, editInput.trim());
      setEditPreview({ taskId, config });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
    setEditLoading(false);
  }

  async function handleEditConfirm() {
    if (!editPreview) return;
    await api.applyEdit(editPreview.taskId, editPreview.config);
    setEditPreview(null);
    setEditingTask(null);
    setEditInput("");
    refresh();
  }

  async function handleSchedulerToggle() {
    if (schedulerRunning) {
      await api.stopScheduler();
    } else {
      await api.startScheduler();
    }
    refresh();
  }

  return (
    <div className="app">
      <header>
        <h1>Cadence</h1>
        <button
          className={`service-badge ${schedulerRunning ? "running" : "stopped"}`}
          onClick={handleSchedulerToggle}
          style={{ cursor: "pointer", border: "none" }}
        >
          {schedulerRunning ? "● Scheduler running" : "▶ Start scheduler"}
        </button>
      </header>

      {!connected && (
        <div className="error-banner">
          Cannot connect to Cadence server. Run <code>cadence ui</code> in your terminal.
        </div>
      )}

      {!schedulerRunning && tasks.length > 0 && connected && (
        <div className="warning-banner">
          <span>Scheduler is not running — tasks won't execute on schedule.</span>
          <button onClick={handleSchedulerToggle}>Start scheduler</button>
        </div>
      )}

      <form className="new-task-bar" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          placeholder='Describe a task... e.g. "check my email every 2 hours for recruiter messages"'
          disabled={analyzing}
          autoComplete="off"
          name="cadence-task-input"
          rows={Math.min(Math.max(1, input.split("\n").length, Math.ceil(input.length / 80)), 5)}
        />
        <button type="submit" disabled={analyzing || !input.trim()}>
          {analyzing ? <span className="spinner" /> : "Create"}
        </button>
      </form>

      {analyzing && (
        <div className="analyzing-card">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className="spinner" />
            <div>
              <div style={{ fontWeight: 600, color: "#c4b5fd" }}>{analyzeStep}</div>
              <div style={{ color: "#8b8fa8", fontSize: "0.8rem", marginTop: "0.25rem" }}>This usually takes 15-30 seconds</div>
            </div>
          </div>
          <div style={{ marginTop: "1rem", background: "rgba(139, 92, 246, 0.1)", borderRadius: 8, padding: "0.6rem 0.85rem", fontSize: "0.83rem", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
            <div style={{ color: "#a78bfa", marginBottom: "0.2rem", fontWeight: 500 }}>Your request:</div>
            <div style={{ color: "#e2e8f0" }}>"{input}"</div>
          </div>
        </div>
      )}

      {preview && (
        <div className="preview-card">
          <h3>Here's what I'll set up:</h3>
          <div className="preview-field"><span className="label">Name</span><span>{preview.name}</span></div>
          <div className="preview-field"><span className="label">Schedule</span><span>{preview.schedule}</span></div>
          <div className="preview-field"><span className="label">Prompt</span><span style={{ color: "#ccc" }}>{preview.prompt}</span></div>
          <div className="preview-field"><span className="label">Mode</span><span>{preview.alertOnly ? `Alert-only: ${preview.alertCondition}` : "Always notify"}</span></div>
          {preview.allowedTools.length > 0 && (
            <div className="preview-field"><span className="label">Tools</span><span>{preview.allowedTools.join(", ")}</span></div>
          )}
          {preview.workingDir && (
            <div className="preview-field"><span className="label">Directory</span><span>{preview.workingDir}</span></div>
          )}
          <div className="preview-actions">
            <button className="btn-confirm" onClick={confirmCreate} disabled={creating}>
              {creating ? "Creating..." : "Create task"}
            </button>
            <button className="btn-cancel" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="section-title">Tasks ({tasks.length})</div>
      <div className="task-list">
        {tasks.length === 0 && <div className="empty">No tasks yet. Describe one above to get started.</div>}
        {tasks.map((task) => (
          <div className="task-card" key={task.id}>
            <div className="task-header">
              <div className="task-name">
                <span className={`dot ${task.enabled ? "active" : "disabled"}`} />
                {task.name}
                {task.alertOnly && <span className="alert-badge">alert-only</span>}
              </div>
              <div className="task-actions">
                <button className="test-btn" onClick={() => handleRun(task.id)} disabled={runningTask === task.id} title="Run once to test — does not affect the schedule">
                  {runningTask === task.id ? (
                    <><span className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} /> Testing...</>
                  ) : "⚡ Test once"}
                </button>
                <button onClick={() => { setEditingTask(editingTask === task.id ? null : task.id); setEditInput(""); setEditPreview(null); }}>
                  {editingTask === task.id ? "Cancel edit" : "Edit"}
                </button>
                <button onClick={() => handleToggle(task.id, !task.enabled)}>
                  {task.enabled ? "Disable" : "Enable"}
                </button>
                <button className="danger" onClick={() => handleDelete(task.id)}>Delete</button>
              </div>
            </div>
            <div className="task-meta">
              {task.scheduleHuman} · <span className="task-id">{task.id}</span>
              {task.lastRun && ` · Last: ${timeAgo(task.lastRun)} (${task.lastResult})`}
            </div>
            <div className="task-prompt">
              "{expandedPrompts.has(task.id) ? task.prompt : task.prompt.slice(0, 120)}{!expandedPrompts.has(task.id) && task.prompt.length > 120 ? "..." : ""}"
            </div>
            {task.prompt.length > 120 && (
              <button
                className="log-expand"
                style={{ marginTop: "0.4rem" }}
                onClick={() => {
                  const next = new Set(expandedPrompts);
                  if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                  setExpandedPrompts(next);
                }}
              >
                {expandedPrompts.has(task.id) ? "Show less" : "Show more"}
              </button>
            )}
            {task.alertCondition && (
              <div className="task-alert">Alert when: {task.alertCondition}</div>
            )}

            {editingTask === task.id && (
              <div className="edit-area">
                <div className="edit-input-row">
                  <input
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleEditSubmit(task.id); }}
                    placeholder='Describe the change... e.g. "change to every 4 hours" or "also check for spam"'
                    disabled={editLoading}
                    autoFocus
                  />
                  <button onClick={() => handleEditSubmit(task.id)} disabled={editLoading || !editInput.trim()}>
                    {editLoading ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : "Apply"}
                  </button>
                </div>
                {editLoading && (
                  <div style={{ color: "#a78bfa", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    Claude is modifying the task...
                  </div>
                )}
                {editPreview && editPreview.taskId === task.id && (
                  <div className="edit-preview">
                    <div className="preview-field"><span className="label">Name</span><span>{editPreview.config.name}</span></div>
                    <div className="preview-field"><span className="label">Schedule</span><span>{editPreview.config.schedule}</span></div>
                    <div className="preview-field"><span className="label">Prompt</span><span>{editPreview.config.prompt}</span></div>
                    <div className="preview-field"><span className="label">Mode</span><span>{editPreview.config.alertOnly ? `Alert-only: ${editPreview.config.alertCondition}` : "Always notify"}</span></div>
                    {editPreview.config.allowedTools.length > 0 && (
                      <div className="preview-field"><span className="label">Tools</span><span>{editPreview.config.allowedTools.join(", ")}</span></div>
                    )}
                    <div className="preview-actions">
                      <button className="btn-confirm" onClick={handleEditConfirm}>Save changes</button>
                      <button className="btn-cancel" onClick={() => setEditPreview(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="section-title">Recent Activity</div>
      <div className="log-list">
        {logs.length === 0 && <div className="empty">No runs yet.</div>}
        {logs.map((log, i) => {
          const task = tasks.find((t) => t.id === log.taskId);
          const logKey = `${log.taskId}-${log.timestamp}`;
          const isExpanded = expandedLogs.has(logKey);
          const stdout = log.stdout.trim();
          const isLong = stdout.length > 300;

          return (
            <div className="log-entry" key={i}>
              <div className="log-header">
                <span className="icon">
                  {log.exitCode !== 0 ? "✗" : log.alerted ? "🔔" : "✓"}
                </span>
                <strong>{task?.name ?? log.taskId}</strong>
                <span className="log-time">{timeAgo(log.timestamp)} · {log.duration}ms</span>
                <button
                  className="log-delete"
                  onClick={async () => { await api.deleteLog(log.taskId, log.timestamp); refresh(); }}
                  title="Delete this log"
                >×</button>
              </div>
              {stdout && (
                <div className={`log-output markdown ${isExpanded ? "expanded" : ""}`}>
                  <Markdown remarkPlugins={[remarkGfm]}>{isExpanded ? stdout : stdout.slice(0, 300) + (isLong && !isExpanded ? "..." : "")}</Markdown>
                </div>
              )}
              {isLong && (
                <button
                  className="log-expand"
                  onClick={() => {
                    const next = new Set(expandedLogs);
                    if (isExpanded) next.delete(logKey); else next.add(logKey);
                    setExpandedLogs(next);
                  }}
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              )}
              {log.exitCode !== 0 && log.stderr.trim() && (
                <div className="log-output" style={{ borderColor: "rgba(239,68,68,0.3)" }}>{log.stderr.trim()}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
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
