import { execFile } from "node:child_process";

export function notify(title: string, message: string): void {
  if (process.platform === "darwin") {
    execFile("osascript", [
      "-e",
      `display notification "${escape(message)}" with title "${escape(title)}" sound name "Glass"`,
    ]);
  } else if (process.platform === "linux") {
    execFile("notify-send", [title, escape(message)]);
  }
}

function escape(str: string): string {
  return str.replace(/["\\]/g, "\\$&").slice(0, 200);
}
