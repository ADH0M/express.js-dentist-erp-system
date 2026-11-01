import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { createApp } from "./app";
// eslint-disable-next-line no-console
const log = console.log.bind(console);

async function main(): Promise<void> {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    log(`🦷 Dentist ERP API listening on http://localhost:${env.PORT}${env.API_PREFIX} [${env.NODE_ENV}]`);
  });

  /* ---------- Graceful shutdown ---------- */
  const shutdown = async (signal: string): Promise<void> => {
    log(`\n${signal} received — shutting down gracefully…`);
    server.close(async () => {
      await prisma.$disconnect();
      log("HTTP server and Prisma connection closed.");
      process.exit(0);
    });

    // Hard exit if a keep-alive connection keeps the server open
    setTimeout(() => {
      log("Forcing exit after shutdown timeout.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  log("❌ Fatal error while starting the server:");
  log(error);
  process.exit(1);
});
