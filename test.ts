import { Logger } from "./src";

const logger = new Logger({
  filePath: "logs/app.log",
});

logger.info("file logging started");
logger.error("this goes to console AND file");
