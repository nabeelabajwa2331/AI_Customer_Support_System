// Load server/.env before anything reads configuration.
import 'dotenv/config';

import { createApp } from './app.js';
import { config } from './config/env.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(
    `[server] ${config.serviceName} listening on http://127.0.0.1:${config.port} (${config.nodeEnv})`,
  );
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`[server] Received ${signal}. Shutting down...`);
  server.close((error) => {
    if (error) {
      console.error('[server] Error during shutdown:', error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
