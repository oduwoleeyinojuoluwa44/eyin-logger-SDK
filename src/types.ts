export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RedactionRule {
  pattern: RegExp;
  replacement?: string;
}

export interface RedactionConfig {
  enabled?: boolean;
  safeByDefault?: boolean;
  replacement?: string;
  rules?: RedactionRule[];
}

export interface RemoteConfig {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface QueueConfig {
  enabled?: boolean;
  filePath?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxRetries?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  flushOnExit?: boolean;
}

export interface LoggerConfig {
  level?: LogLevel;
  service?: string;
  filePath?: string;
  redaction?: RedactionConfig;
  remote?: RemoteConfig;
  queue?: QueueConfig;
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  meta?: Record<string, unknown>;
}
