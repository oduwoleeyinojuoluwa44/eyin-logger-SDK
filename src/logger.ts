import { LoggerConfig, LogLevel, LogRecord } from "./types";
import { redactRecord, resolveRedaction, RedactionState } from "./redaction";
import { FileTransport } from "./transports/file";
import { ReliableHttpTransport } from "./transports/reliable-http";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isLogLevel = (value: string | undefined): value is LogLevel =>
  value === "debug" ||
  value === "info" ||
  value === "warn" ||
  value === "error";

export class Logger {
  private level: LogLevel;
  private service?: string;
  private fileTransport?: FileTransport;
  private remoteTransport?: ReliableHttpTransport;
  private redactionState: RedactionState;

  constructor(config: LoggerConfig = {}) {
    const envLevel = process.env.LOG_LEVEL;
    const resolvedLevel = config.level ?? envLevel;
    this.level = isLogLevel(resolvedLevel) ? resolvedLevel : "info";

    this.service = config.service ?? process.env.LOG_SERVICE;
    this.redactionState = resolveRedaction(config.redaction);

    if (config.filePath) {
      this.fileTransport = new FileTransport(config.filePath);
    }

    if (config.remote?.url) {
      this.remoteTransport = new ReliableHttpTransport(
        config.remote,
        config.queue
      );
    }
  }

  private shouldLog(level: LogLevel) {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private normalizeMeta(meta?: unknown): Record<string, unknown> | undefined {
    if (meta === undefined) {
      return undefined;
    }
    if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
      return meta as Record<string, unknown>;
    }
    return { value: meta };
  }

  private stringifyRecord(record: LogRecord): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(record, (_key, value) => {
      if (value !== null && typeof value === "object") {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    });
  }

  log(level: LogLevel, message: string, meta?: unknown) {
    if (!this.shouldLog(level)) {
      return;
    }

    const record: LogRecord = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.service,
      meta: this.normalizeMeta(meta),
    };

    const outputRecord = redactRecord(record, this.redactionState);
    const line = this.stringifyRecord(outputRecord);
    switch (level) {
      case "error":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "debug":
        console.debug(line);
        break;
      default:
        console.log(line);
    }

    if (this.fileTransport) {
      this.fileTransport.write(line);
    }

    if (this.remoteTransport) {
      this.remoteTransport.enqueue(line);
    }
  }

  info(msg: string, meta?: unknown) {
    this.log("info", msg, meta);
  }

  error(msg: string, meta?: unknown) {
    this.log("error", msg, meta);
  }

  warn(msg: string, meta?: unknown) {
    this.log("warn", msg, meta);
  }

  debug(msg: string, meta?: unknown) {
    this.log("debug", msg, meta);
  }

  flush() {
    return this.remoteTransport?.flush();
  }

  close() {
    this.remoteTransport?.close();
  }
}
