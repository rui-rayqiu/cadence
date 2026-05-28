const BASE = "/api";

export async function fetchStatus() {
  const res = await fetch(`${BASE}/status`);
  return res.json();
}

export async function fetchTasks() {
  const res = await fetch(`${BASE}/tasks`);
  return res.json();
}

export async function fetchLogs(taskId?: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (taskId) params.set("taskId", taskId);
  const res = await fetch(`${BASE}/logs?${params}`);
  return res.json();
}

export async function deleteTask(id: string) {
  await fetch(`${BASE}/tasks/${id}`, { method: "DELETE" });
}

export async function toggleTask(id: string, enabled: boolean) {
  const res = await fetch(`${BASE}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return res.json();
}

export async function runTaskNow(id: string) {
  const res = await fetch(`${BASE}/tasks/${id}/run`, { method: "POST" });
  return res.json();
}

export async function analyzeRequest(request: string) {
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

export async function createTask(task: any) {
  const res = await fetch(`${BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  return res.json();
}

export async function deleteLog(taskId: string, timestamp: string) {
  await fetch(`${BASE}/logs`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, timestamp }),
  });
}

export async function editTask(id: string, modification: string) {
  const res = await fetch(`${BASE}/tasks/${id}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modification }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

export async function applyEdit(id: string, config: any) {
  const res = await fetch(`${BASE}/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function startScheduler() {
  const res = await fetch(`${BASE}/scheduler/start`, { method: "POST" });
  return res.json();
}

export async function stopScheduler() {
  const res = await fetch(`${BASE}/scheduler/stop`, { method: "POST" });
  return res.json();
}
