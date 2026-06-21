export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL: LogLevel = (() => {
  const env = process.env.LOG_LEVEL?.toUpperCase();
  if (env === 'DEBUG') return LogLevel.DEBUG;
  if (env === 'WARN') return LogLevel.WARN;
  if (env === 'ERROR') return LogLevel.ERROR;
  return LogLevel.INFO;
})();

function levelLabel(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG: return 'DEBUG';
    case LogLevel.WARN:  return 'WARN ';
    case LogLevel.ERROR: return 'ERROR';
    default:             return 'INFO ';
  }
}

export class Log {
  private constructor(private readonly tag: string) {}

  static for(tag: string): Log {
    return new Log(tag);
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= LOG_LEVEL;
  }

  private writeLog(level: LogLevel, message: string): void {
    if (!this.shouldLog(level)) return;
    console.log(`[${levelLabel(level)}] [${this.tag}] ${message}`);
  }

  debug(message: string): void {
    this.writeLog(LogLevel.DEBUG, message);
  }

  info(message: string): void {
    this.writeLog(LogLevel.INFO, message);
  }

  success(message: string): void {
    this.writeLog(LogLevel.INFO, `✓ ${message}`);
  }

  warn(message: string): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(`[WARN ] [${this.tag}] ⚠ ${message}`);
  }

  error(message: string): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    console.error(`[ERROR] [${this.tag}] ✖ ${message}`);
  }

  kv(key: string, value: unknown, indent = 1): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const pad = '  '.repeat(indent);
    console.log(`[INFO ] [${this.tag}] ${pad}${key} = ${value}`);
  }

  props(obj: Record<string, unknown>, indent = 1): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const pad = '  '.repeat(indent);
    for (const [k, v] of Object.entries(obj)) {
      console.log(`[INFO ] [${this.tag}] ${pad}${k} = ${v}`);
    }
  }

  static raw(message: string): void {
    console.log(message);
  }

  static divider(char = '═'): void {
    console.log(char.repeat(47));
  }

  static subsection(title: string): void {
    console.log(`${'─'.repeat(3)} ${title} ${'─'.repeat(3)}`);
  }

  static section(title: string): void {
    console.log(`┏${'━'.repeat(5)} ${title} ${'━'.repeat(5)}┓`);
  }

  static step(num: number, total: number, label: string): void {
    const w = 55;
    const top = `┏${'━'.repeat(w - 2)}┓`;
    const stepText = `STEP ${num}/${total} │ ${label}`;
    const mid = `┃ ${stepText}${' '.repeat(w - 4 - stepText.length)}┃`;
    const bot = `┗${'━'.repeat(w - 2)}┛`;
    console.log(top);
    console.log(mid);
    console.log(bot);
  }

  static banner(title: string): void {
    const w = 47;
    const top = `╔${'═'.repeat(w - 2)}╗`;
    const titleLine = `║${' '.repeat(Math.floor((w - 2 - title.length) / 2))}${title}${' '.repeat(Math.ceil((w - 2 - title.length) / 2))}║`;
    const bot = `╚${'═'.repeat(w - 2)}╝`;
    console.log(top);
    console.log(titleLine);
    console.log(bot);
  }
}
