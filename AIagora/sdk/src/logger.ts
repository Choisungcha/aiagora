// ANSI color codes — no external dependencies needed
const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  cyan:    "\x1b[36m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  magenta: "\x1b[35m",
  red:     "\x1b[31m",
  blue:    "\x1b[34m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",
} as const;

function ts(): string {
  const d = new Date();
  const hms = d.toTimeString().slice(0, 8);
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${C.gray}[${hms}.${ms}]${C.reset}`;
}

function pad(s: string, n = 18): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

const ICONS: Record<string, string> = {
  CONNECT:   `${C.cyan}⟳ CONNECT  ${C.reset}`,
  BROADCAST: `${C.yellow}▶ BROADCAST${C.reset}`,
  RECEIVED:  `${C.blue}◀ RECEIVED ${C.reset}`,
  NEGOTIATE: `${C.magenta}↔ NEGOTIATE${C.reset}`,
  ACCEPT:    `${C.green}✓ ACCEPT   ${C.reset}`,
  REJECT:    `${C.red}✗ REJECT   ${C.reset}`,
  "API CALL":  `${C.cyan}⬤ API CALL ${C.reset}`,
  "API RESP":  `${C.green}⬤ API RESP ${C.reset}`,
  "API FAIL":  `${C.red}⬤ API FAIL ${C.reset}`,
  ONCHAIN:   `${C.yellow}⛓ ON-CHAIN ${C.reset}`,
  DEAL:      `${C.green}💰 DEAL    ${C.reset}`,
  INFO:      `${C.white}ℹ INFO     ${C.reset}`,
  ERROR:     `${C.red}✖ ERROR    ${C.reset}`,
  DIVIDER:   `${C.gray}────────────────────────────────────────────────────────────${C.reset}`,
};

export function log(agentName: string, event: string, detail: string): void {
  const icon = ICONS[event] ?? `  ${event.padEnd(9)} `;
  const name = `${C.bold}${pad(`🤖 ${agentName}`)}${C.reset}`;
  console.log(`${ts()} ${name}  ${icon}  ${detail}`);
}

export function divider(title?: string): void {
  if (title) {
    const line = "─".repeat(Math.max(0, 54 - title.length - 2));
    console.log(`\n${C.bold}${C.cyan}┌── ${title} ${line}${C.reset}`);
  } else {
    console.log(ICONS["DIVIDER"]);
  }
}

export function banner(text: string): void {
  console.log(`\n${C.bold}${C.cyan}${"═".repeat(62)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${text}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${"═".repeat(62)}${C.reset}\n`);
}
