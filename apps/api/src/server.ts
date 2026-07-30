import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = await buildApp({ env });

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error({ err: error }, "failed to start api");
  process.exit(1);
}
