const PATTERNS: [RegExp, string][] = [
  [/^every\s+(\d+)\s*min(ute)?s?$/i, "*/$1 * * * *"],
  [/^every\s+(\d+)\s*hours?$/i, "0 */$1 * * *"],
  [/^every\s+hour$/i, "0 * * * *"],
  [/^every\s+(\d+)\s*hours?\s+at\s+:(\d+)$/i, "$2 */$1 * * *"],
  [/^hourly$/i, "0 * * * *"],
  [/^daily\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, "DAILY"],
  [/^every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, "DAILY"],
  [/^weekdays\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, "WEEKDAY"],
  [/^every\s+weekday\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, "WEEKDAY"],
  [/^every\s+(\d+)\s*days?$/i, "0 0 */$1 * *"],
  [/^twice\s+a\s+day$/i, "0 9,17 * * *"],
  [/^every\s+morning$/i, "0 9 * * *"],
  [/^every\s+evening$/i, "0 18 * * *"],
  [/^every\s+night$/i, "0 21 * * *"],
];

export function parseSchedule(input: string): string | null {
  const trimmed = input.trim();

  // Already a cron expression (5 space-separated parts)
  if (/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(trimmed)) {
    return trimmed;
  }

  for (const [pattern, template] of PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    if (template === "DAILY" || template === "WEEKDAY") {
      const hour = parseHour(match[1], match[3]);
      const minute = match[2] || "0";
      const dow = template === "WEEKDAY" ? "1-5" : "*";
      return `${minute} ${hour} * * ${dow}`;
    }

    let result = template;
    for (let i = 1; i < match.length; i++) {
      if (match[i] !== undefined) {
        result = result.replace(`$${i}`, match[i]);
      }
    }
    return result;
  }

  return null;
}

function parseHour(hourStr: string, ampm?: string): number {
  let hour = parseInt(hourStr, 10);
  if (ampm) {
    if (ampm.toLowerCase() === "pm" && hour < 12) hour += 12;
    if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;
  }
  return hour;
}

export function describeSchedule(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;

  const [min, hour, dom, , dow] = parts;

  if (min.startsWith("*/") && hour === "*") {
    return `every ${min.slice(2)} minutes`;
  }
  if (min === "0" && hour.startsWith("*/")) {
    return `every ${hour.slice(2)} hours`;
  }
  if (min === "0" && hour === "*") {
    return "every hour";
  }
  if (dom === "*" && dow === "1-5") {
    return `weekdays at ${formatTime(hour, min)}`;
  }
  if (dom === "*" && dow === "*" && !hour.includes("/") && !hour.includes(",")) {
    return `daily at ${formatTime(hour, min)}`;
  }
  if (hour.includes(",")) {
    return `daily at ${hour.split(",").map((h) => formatTime(h, min)).join(" and ")}`;
  }

  return cron;
}

function formatTime(hour: string, min: string): string {
  const h = parseInt(hour, 10);
  const m = min.padStart(2, "0");
  if (h === 0) return `12:${m}am`;
  if (h < 12) return `${h}:${m}am`;
  if (h === 12) return `12:${m}pm`;
  return `${h - 12}:${m}pm`;
}
