import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";

const LOG_DIR = resolve(homedir(), ".cadence");

function getNodePath(): string {
  return execSync("which node", { encoding: "utf8" }).trim();
}

// --- macOS launchd ---

const PLIST_NAME = "com.cadence.scheduler";
const PLIST_PATH = resolve(homedir(), "Library/LaunchAgents", `${PLIST_NAME}.plist`);

function installMac(projectDir: string): void {
  const nodePath = getNodePath();
  const cliPath = resolve(projectDir, "dist/cli.js");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${cliPath}</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${projectDir}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/scheduler.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/scheduler.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${dirname(nodePath)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>`;

  const plistDir = dirname(PLIST_PATH);
  if (!existsSync(plistDir)) mkdirSync(plistDir, { recursive: true });

  writeFileSync(PLIST_PATH, plist);
  execSync(`launchctl load ${PLIST_PATH}`);

  console.log(chalk.green("✓ Cadence installed as a launch agent."));
  console.log(chalk.dim(`  Plist: ${PLIST_PATH}`));
  console.log(chalk.dim(`  Logs:  ${LOG_DIR}/scheduler.log`));
  console.log(chalk.dim(`  It will start automatically on login.`));
}

function uninstallMac(): void {
  if (!existsSync(PLIST_PATH)) {
    console.log(chalk.dim("Cadence is not installed as a launch agent."));
    return;
  }
  try { execSync(`launchctl unload ${PLIST_PATH}`); } catch {}
  unlinkSync(PLIST_PATH);
  console.log(chalk.green("✓ Cadence launch agent removed."));
}

function isRunningMac(): { installed: boolean; running: boolean; pid?: string } {
  if (!existsSync(PLIST_PATH)) return { installed: false, running: false };
  try {
    const output = execSync(`launchctl list | grep ${PLIST_NAME}`, { encoding: "utf8" });
    const parts = output.trim().split(/\s+/);
    const pid = parts[0];
    if (pid && pid !== "-") return { installed: true, running: true, pid };
    return { installed: true, running: false };
  } catch {
    return { installed: true, running: false };
  }
}

// --- Linux systemd ---

const SYSTEMD_NAME = "cadence";
const SYSTEMD_PATH = resolve(homedir(), ".config/systemd/user", `${SYSTEMD_NAME}.service`);

function hasSystemd(): boolean {
  try {
    execSync("systemctl --user --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const PID_FILE = resolve(LOG_DIR, "scheduler.pid");

function installLinux(projectDir: string): void {
  if (!hasSystemd()) {
    installLinuxNohup(projectDir);
    return;
  }

  const nodePath = getNodePath();
  const cliPath = resolve(projectDir, "dist/cli.js");

  const unit = `[Unit]
Description=Cadence scheduler
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${cliPath} start
WorkingDirectory=${projectDir}
Restart=on-failure
StandardOutput=append:${LOG_DIR}/scheduler.log
StandardError=append:${LOG_DIR}/scheduler.err
Environment=PATH=${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
`;

  const unitDir = dirname(SYSTEMD_PATH);
  if (!existsSync(unitDir)) mkdirSync(unitDir, { recursive: true });

  writeFileSync(SYSTEMD_PATH, unit);
  execSync("systemctl --user daemon-reload");
  execSync(`systemctl --user enable --now ${SYSTEMD_NAME}`);

  console.log(chalk.green("✓ Cadence installed as a systemd user service."));
  console.log(chalk.dim(`  Unit: ${SYSTEMD_PATH}`));
  console.log(chalk.dim(`  Logs: ${LOG_DIR}/scheduler.log`));
  console.log(chalk.dim(`  It will start automatically on login.`));
}

function installLinuxNohup(projectDir: string): void {
  const nodePath = getNodePath();
  const cliPath = resolve(projectDir, "dist/cli.js");

  execSync(
    `nohup ${nodePath} ${cliPath} start >> ${LOG_DIR}/scheduler.log 2>> ${LOG_DIR}/scheduler.err & echo $! > ${PID_FILE}`,
    { cwd: projectDir, shell: "/bin/sh" }
  );

  const pid = readFileSync(PID_FILE, "utf8").trim();
  console.log(chalk.green(`✓ Cadence scheduler started in background (PID ${pid}).`));
  console.log(chalk.dim(`  Logs: ${LOG_DIR}/scheduler.log`));
  console.log(chalk.dim(`  PID file: ${PID_FILE}`));
  console.log(chalk.yellow(`  Note: This won't survive a reboot. Run 'cadence install' again after restart.`));
}

function uninstallLinux(): void {
  if (hasSystemd() && existsSync(SYSTEMD_PATH)) {
    try { execSync(`systemctl --user disable --now ${SYSTEMD_NAME}`); } catch {}
    unlinkSync(SYSTEMD_PATH);
    try { execSync("systemctl --user daemon-reload"); } catch {}
    console.log(chalk.green("✓ Cadence systemd service removed."));
    return;
  }

  if (existsSync(PID_FILE)) {
    const pid = readFileSync(PID_FILE, "utf8").trim();
    try { execSync(`kill ${pid}`); } catch {}
    unlinkSync(PID_FILE);
    console.log(chalk.green(`✓ Cadence scheduler stopped (PID ${pid}).`));
    return;
  }

  console.log(chalk.dim("Cadence is not installed as a background service."));
}

function isRunningLinux(): { installed: boolean; running: boolean; pid?: string } {
  if (hasSystemd() && existsSync(SYSTEMD_PATH)) {
    try {
      const output = execSync(`systemctl --user is-active ${SYSTEMD_NAME}`, { encoding: "utf8" });
      if (output.trim() === "active") {
        const pidOutput = execSync(`systemctl --user show ${SYSTEMD_NAME} --property=MainPID`, { encoding: "utf8" });
        const pid = pidOutput.trim().split("=")[1];
        return { installed: true, running: true, pid };
      }
      return { installed: true, running: false };
    } catch {
      return { installed: true, running: false };
    }
  }

  if (existsSync(PID_FILE)) {
    const pid = readFileSync(PID_FILE, "utf8").trim();
    try {
      execSync(`kill -0 ${pid}`, { stdio: "ignore" });
      return { installed: true, running: true, pid };
    } catch {
      return { installed: true, running: false };
    }
  }

  return { installed: false, running: false };
}

// --- Public API ---

export function install(projectDir: string): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

  if (process.platform === "darwin") {
    installMac(projectDir);
  } else if (process.platform === "linux") {
    installLinux(projectDir);
  } else {
    console.log(chalk.yellow("Background service install is not supported on this platform."));
    console.log(chalk.dim("Use `cadence start` to run the scheduler manually."));
  }
}

export function uninstall(): void {
  if (process.platform === "darwin") {
    uninstallMac();
  } else if (process.platform === "linux") {
    uninstallLinux();
  } else {
    console.log(chalk.dim("No background service to uninstall on this platform."));
  }
}

export function isRunning(): { installed: boolean; running: boolean; pid?: string } {
  if (process.platform === "darwin") return isRunningMac();
  if (process.platform === "linux") return isRunningLinux();
  return { installed: false, running: false };
}

export function status(): void {
  const state = isRunning();
  if (!state.installed) {
    console.log(chalk.dim("Not installed as a background service."));
  } else if (state.running) {
    console.log(chalk.green(`● Cadence is running (PID ${state.pid})`));
  } else {
    console.log(chalk.yellow(`○ Cadence is installed but not running`));
  }
}
