import fs from "node:fs";
import path from "node:path";
import pino from "pino";

const LOG_DIR = path.resolve(process.cwd(), "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const level = process.env.LOG_LEVEL ?? "info";

/**
 * General application log: pretty-printed to the console, raw JSON lines
 * appended to logs/app.log.
 */
export const logger = pino(
  { level },
  pino.multistream([
    { stream: pino.transport({ target: "pino-pretty", options: { colorize: true, translateTime: "yyyy-mm-dd HH:MM:ss" } }) },
    { stream: pino.destination({ dest: path.join(LOG_DIR, "app.log"), mkdir: true }) },
  ]),
);

/**
 * Machine-readable trade lifecycle log: JSON lines appended to logs/trades.log.
 * Never routed to the console — read it with `tail -f logs/trades.log | jq`.
 */
export const tradeLogger = pino(
  { level: "info" },
  pino.destination({ dest: path.join(LOG_DIR, "trades.log"), mkdir: true }),
);
