import { App } from './app';
import * as dotenv from 'dotenv';
import { startPostEventsConsumer, stopPostEventsConsumer } from './kafka/consumer';
import { initializeElasticsearchClient, ensureIndexExists } from './clients/elasticsearch.client';
import logger from './utils/logger';

dotenv.config();

const port = process.env.PORT || 3003;

const startService = async () => {
  logger.info('Search Service starting...', { type: 'StartupLog.Init' });
  try {
    // 1. Initialize Elasticsearch Client
    initializeElasticsearchClient(logger);
    await ensureIndexExists();
    logger.info('Elasticsearch client ready and index is present.', { type: 'StartupLog.ESReady' });

    // 2. Start Kafka Consumer
    await startPostEventsConsumer(logger);
    logger.info('Kafka consumer for post events started successfully.', { type: 'StartupLog.KafkaConsumerReady' });
    
    // 3. Start Express App
    const appInstance = new App();
    const server = appInstance.app.listen(port, () => {
      logger.info(`Search Service is running on port ${port}`, { port, type: 'StartupLog.HttpReady' });
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down Search Service gracefully.`, { signal, type: 'ShutdownLog.SignalReceived' });
      server.close(async (err?: Error) => {
        if (err) logger.error('Error during HTTP server close', { error: err.message });
        else logger.info('HTTP server closed.');
        
        await stopPostEventsConsumer();
        logger.info('Post events Kafka consumer stopped.');
        
        process.exit(err ? 1 : 0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error: any) {
    logger.error('Failed to start Search Service.', { error: error.message, stack: error.stack, type: 'StartupLog.FatalError' });
    process.exit(1);
  }
};

startService();