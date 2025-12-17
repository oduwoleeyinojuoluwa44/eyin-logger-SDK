import { LoggerConfig, LogLevel, LogRecord } from "./types";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 10,
    info:20,
    warn:30,
    error:40,
};

export class Logger {
    private level: LogLevel;
    private service?: string;

    constructor(config: LoggerConfig = {} ) {
        this.level = config.level ?? "info";
        this.service = config.service;
    }

    private shouldLog(level: LogLevel) {
        return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];   
    }

   

  log(level: LogLevel, message: string, meta?: any) {
    const record: LogRecord = {
      level,
      message,
      timestamp: new Date().toISOString(),
      meta,
    };

    console.log(JSON.stringify(record));
  }

  info(msg: string, meta?: any) {
    this.log("info", msg, meta);
  }

  error(msg: string, meta?: any) {
    this.log("error", msg, meta);
  }

  warn(msg: string, meta?: any) {
    this.log("warn", msg, meta);
  }

  debug(msg: string, meta?: any) {
    this.log("debug", msg, meta);
  }
}
