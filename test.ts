import { Logger } from "./src";

const logger = new Logger({
  filePath: "logs/app.log",
  redaction: {
    safeByDefault: true,
    rules: [{ pattern: /secret_\w+/g, replacement: "[SECRET]" }],
  },
  remote: { url: "http://localhost:4000/logs" },
  queue: { filePath: "logs/queue.json", flushIntervalMs: 2000 },
});

const meta: Record<string, unknown> = {
  email: "user@example.com",
  token: "secret_abc",
};

logger.info("User email: user@example.com", meta);
logger.error("This goes to console, file, and queue");
void logger.flush();
