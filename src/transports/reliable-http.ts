import fs from "fs";
import path from "path";
import { QueueConfig, RemoteConfig } from "../types";

interface QueuedItem {
  line: string;
  attempts: number;
}

interface QueueFile {
  version: 1;
  items: QueuedItem[];
}

interface ResolvedQueueConfig {
  enabled: boolean;
  filePath: string;
  flushIntervalMs: number;
  maxBatchSize: number;
  maxRetries: number;
  backoffMs: number;
  maxBackoffMs: number;
  flushOnExit: boolean;
}

export class ReliableHttpTransport {
  private static exitHandlersRegistered = false;
  private static instances = new Set<ReliableHttpTransport>();
  private readonly config: RemoteConfig;
  private readonly queueConfig: ResolvedQueueConfig;
  private readonly queue: QueuedItem[] = [];
  private ready: Promise<void>;
  private persistPromise: Promise<void> = Promise.resolve();
  private isFlushing = false;
  private flushTimer?: NodeJS.Timeout;
  private interval?: NodeJS.Timeout;
  private currentBackoffMs: number;

  constructor(config: RemoteConfig, queueConfig?: QueueConfig) {
    this.config = config;
    this.queueConfig = {
      enabled: queueConfig?.enabled ?? true,
      filePath:
        queueConfig?.filePath ??
        path.join(process.cwd(), "logs", "eyin-logger-queue.json"),
      flushIntervalMs: queueConfig?.flushIntervalMs ?? 5000,
      maxBatchSize: queueConfig?.maxBatchSize ?? 50,
      maxRetries: queueConfig?.maxRetries ?? 5,
      backoffMs: queueConfig?.backoffMs ?? 1000,
      maxBackoffMs: queueConfig?.maxBackoffMs ?? 30000,
      flushOnExit: queueConfig?.flushOnExit ?? true,
    };
    this.currentBackoffMs = this.queueConfig.backoffMs;
    this.ready = this.queueConfig.enabled
      ? this.loadQueue()
      : Promise.resolve();

    if (this.queueConfig.flushOnExit) {
      ReliableHttpTransport.instances.add(this);
      this.registerExitHandlers();
    }

    if (this.queueConfig.flushIntervalMs > 0) {
      this.interval = setInterval(
        () => this.scheduleFlush(0),
        this.queueConfig.flushIntervalMs
      );
    }
  }

  enqueue(line: string) {
    void this.ready.then(() => {
      this.queue.push({ line, attempts: 0 });
      if (this.queueConfig.enabled) {
        this.persistQueue();
      }
      this.scheduleFlush(0);
    });
  }

  async flush() {
    await this.ready;
    if (this.isFlushing) {
      return;
    }
    if (this.queue.length === 0) {
      return;
    }

    this.isFlushing = true;
    const batch = this.queue.slice(0, this.queueConfig.maxBatchSize);
    try {
      await this.sendBatch(batch);
      this.queue.splice(0, batch.length);
      this.currentBackoffMs = this.queueConfig.backoffMs;
      if (this.queueConfig.enabled) {
        await this.persistQueue();
      }
      if (this.queue.length > 0) {
        this.scheduleFlush(0);
      }
    } catch (err) {
      for (const item of batch) {
        item.attempts += 1;
      }
      const retained = batch.filter((item) => {
        if (item.attempts > this.queueConfig.maxRetries) {
          console.error("Dropping log after max retries:", item.line);
          return false;
        }
        return true;
      });
      this.queue.splice(0, batch.length, ...retained);
      if (this.queueConfig.enabled) {
        await this.persistQueue();
      }
      console.error("Remote log flush failed:", err);
      if (this.queue.length > 0) {
        this.scheduleFlush(this.currentBackoffMs);
        this.currentBackoffMs = Math.min(
          this.queueConfig.maxBackoffMs,
          this.currentBackoffMs * 2
        );
      }
    } finally {
      this.isFlushing = false;
    }
  }

  close() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    ReliableHttpTransport.instances.delete(this);
  }

  private scheduleFlush(delayMs: number) {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, delayMs);
  }

  private async sendBatch(batch: QueuedItem[]) {
    const payload = batch.map((item) => this.safeParse(item.line));
    const controller =
      this.config.timeoutMs !== undefined ? new AbortController() : undefined;
    let timeout: NodeJS.Timeout | undefined;
    if (controller && this.config.timeoutMs !== undefined) {
      timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    }

    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.config.headers ?? {}),
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private safeParse(line: string) {
    try {
      return JSON.parse(line);
    } catch {
      return { line };
    }
  }

  private async loadQueue() {
    try {
      const data = await fs.promises.readFile(this.queueConfig.filePath, "utf-8");
      const parsed = JSON.parse(data) as QueueFile;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
        this.queue.push(...parsed.items);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to load queue file:", err);
      }
    }
  }

  private persistQueue() {
    const payload: QueueFile = {
      version: 1,
      items: this.queue,
    };
    const dir = path.dirname(this.queueConfig.filePath);
    this.persistPromise = this.persistPromise
      .then(() => fs.promises.mkdir(dir, { recursive: true }))
      .then(() =>
        fs.promises.writeFile(
          this.queueConfig.filePath,
          JSON.stringify(payload),
          "utf-8"
        )
      )
      .catch((err) => {
        console.error("Failed to persist queue:", err);
      });
    return this.persistPromise;
  }

  private registerExitHandlers() {
    if (ReliableHttpTransport.exitHandlersRegistered) {
      return;
    }
    ReliableHttpTransport.exitHandlersRegistered = true;

    process.on("beforeExit", () => {
      void ReliableHttpTransport.flushAll();
    });

    const handleSignal = () => {
      void ReliableHttpTransport.flushAll().finally(() => process.exit(0));
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);
  }

  private static async flushAll() {
    const transports = Array.from(ReliableHttpTransport.instances);
    await Promise.all(
      transports.map((transport) => transport.flush().catch(() => undefined))
    );
  }
}
