import { Logger } from "./src";

const logger = new Logger({
    level: "warn",
    service: "auth-api",
});

logger.debug("This should Not log");
logger.info("This should Not log");
logger.warn("This SHOULD log ");
logger.error("This ALSO logs", {code: 500});
