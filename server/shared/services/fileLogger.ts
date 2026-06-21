import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs', 'server');

const LOG_RESET_ON_START = !/^(0|false|no|off)$/i.test(
  process.env.LOG_RESET_ON_START ?? 'true'
);

let _logDirReady = '';

function ensureDir(): string {
  if (!_logDirReady) {
    _logDirReady = LOG_DIR;
    try { fs.mkdirSync(_logDirReady, { recursive: true }); } catch {}
    if (LOG_RESET_ON_START) {
      try { fs.writeFileSync(path.join(_logDirReady, `${new Date().toISOString().slice(0, 10)}.log`), ''); } catch {}
    }
  }
  return _logDirReady;
}

function ts(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `[${h}:${m}:${s}.${ms}]`;
}

function appendLog(message: string) {
  try {
    const dir = ensureDir();
    const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}.log`);
    fs.appendFileSync(file, `${message}\n`);
  } catch (e) {
    console.error(`[fileLogger] write failed: ${e}`);
  }
}

const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);

function formatArgs(args: any[]): string {
  return args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
}

console.log = (...args: any[]) => {
  const line = formatArgs(args);
  const stamped = `${ts()} ${line}`;
  _origLog(stamped);
  appendLog(stamped);
};

console.warn = (...args: any[]) => {
  const line = formatArgs(args);
  const stamped = `${ts()} ${line}`;
  _origWarn(stamped);
  appendLog(stamped);
};

console.error = (...args: any[]) => {
  const line = formatArgs(args);
  const stamped = `${ts()} ${line}`;
  _origError(stamped);
  appendLog(stamped);
};