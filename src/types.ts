export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerConfig {
    level?: LogLevel;
    service?: string;
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  meta?: Record<string, any>;
}
