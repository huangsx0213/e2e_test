import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs', 'server');

// When true (default), the current day's log file is truncated on server start
// instead of appending to whatever was there before. Set LOG_RESET_ON_START=0
// (or false/no/off) to keep the previous append behavior.
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

export function appendServerLog(level: string, message: string) {
  try {
    const dir = ensureDir();
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `${date}.log`);
    const time = new Date().toISOString().slice(11, 23);
    fs.appendFileSync(file, `[${time}] [${level}] ${message}\n`);
  } catch {}
}

// Patch console on server side
const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log = (...args: any[]) => {
  const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  _origLog(line);
  appendServerLog('LOG', line);
};
console.warn = (...args: any[]) => {
  const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  _origWarn(line);
  appendServerLog('WARN', line);
};
console.error = (...args: any[]) => {
  const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  _origError(line);
  appendServerLog('ERROR', line);
};