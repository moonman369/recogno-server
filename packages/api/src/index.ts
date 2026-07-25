import { closeDatabase, createLogger } from '@recogno/shared';
import { buildApp } from './app.js';

const log = createLogger('api');

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Shutting down API');
    await app.close();
    await closeDatabase();
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  await app.listen({ port: PORT, host: HOST });
  log.info({ port: PORT, host: HOST }, 'API listening');
}

main().catch((error) => {
  log.error({ err: error }, 'API failed to start');
  process.exit(1);
});
