export interface Task {
  id: string;
  name: string;
  prompt: string;
  schedule: string; // cron expression
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
  lastResult?: "success" | "error";
  workingDir?: string;
  notify?: boolean;
  alertOnly?: boolean;
  alertCondition?: string;
  allowedTools?: string[];
}

export interface RunLog {
  taskId: string;
  timestamp: string;
  duration: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  alerted?: boolean;
}
