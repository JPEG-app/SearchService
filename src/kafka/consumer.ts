import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import * as dotenv from 'dotenv';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { PostLifecycleEvent } from '../models/post.model';
import { indexPost, deletePost } from '../clients/elasticsearch.client';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
const clientId = process.env.KAFKA_CLIENT_ID_SEARCH || 'search-service-consumer';
const postLifecycleTopic = process.env.POST_EVENTS_TOPIC || 'post_events';
const consumerGroupId = process.env.KAFKA_CONSUMER_GROUP_SEARCH || 'search-service-post-events-group';

const kafka = new Kafka({
  clientId: clientId,
  brokers: [kafkaBroker],
  retry: {
    initialRetryTime: 3000,
    retries: 30,
  }
});

let consumer: Consumer | null = null;
let consumerLogger: winston.Logger;

export const initializeConsumerLogger = (loggerInstance: winston.Logger) => {
    consumerLogger = loggerInstance;
};

const handlePostLifecycleEvent = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
    const correlationId = message.headers?.['X-Correlation-ID']?.toString() || uuidv4();

    const logMetadata = { topic, partition, offset: message.offset, correlationId, type: 'KafkaConsumerLog.PostEventReceived' };

    if (!message.value) {
        consumerLogger.warn(`Kafka Consumer: Received message with no value.`, logMetadata);
        return;
    }

    const eventDataString = message.value.toString();
    consumerLogger.info(`Kafka Consumer: Received message`, { ...logMetadata, dataPreview: eventDataString.substring(0, 100) });

    try {
        const event: PostLifecycleEvent = JSON.parse(eventDataString);

        if (!event.postId || !event.eventType) {
            consumerLogger.warn('Kafka Consumer: Received malformed post lifecycle event.', { ...logMetadata, eventData: eventDataString, type: 'KafkaConsumerLog.MalformedEvent' });
            return;
        }

        switch (event.eventType) {
            case 'PostCreated':
                // The 'event' object itself contains all post fields.
                await indexPost(event, correlationId);
                consumerLogger.info(`Kafka Consumer: Indexed post due to PostCreated event.`, { ...logMetadata, postId: event.postId, type: 'KafkaConsumerLog.PostCreatedProcessed' });
                break;
            // TODO: The post-service should emit PostUpdated and PostDeleted events.
            // When it does, you can handle them here. For now, we only handle creation.
            // case 'PostUpdated':
            //     await indexPost(event, correlationId); // indexPost works for updates too
            //     break;
            // case 'PostDeleted':
            //     await deletePost(event.postId, correlationId);
            //     break;
            default:
                consumerLogger.info(`Kafka Consumer: Ignoring event type "${event.eventType}"`, { ...logMetadata, eventType: event.eventType, type: 'KafkaConsumerLog.IgnoredEvent' });
        }
    } catch (error: any) {
        consumerLogger.error('Kafka Consumer: Error processing post lifecycle event.', { ...logMetadata, error: error.message, stack: error.stack, type: 'KafkaConsumerLog.ProcessingError' });
    }
};

export const startPostEventsConsumer = async (logger: winston.Logger): Promise<void> => {
    initializeConsumerLogger(logger);
    if (consumer) {
        consumerLogger.info('Kafka Consumer: Post events consumer already running.', { type: 'KafkaConsumerControl.AlreadyRunning' });
        return;
    }
    consumer = kafka.consumer({ groupId: consumerGroupId });

    try {
        await consumer.connect();
        consumerLogger.info(`Kafka Consumer connected`, { clientId, kafkaBroker, consumerGroupId, type: 'KafkaConsumerControl.Connected' });
        await consumer.subscribe({ topic: postLifecycleTopic, fromBeginning: true });
        consumerLogger.info(`Kafka Consumer: Subscribed to topic`, { topic: postLifecycleTopic, type: 'KafkaConsumerControl.Subscribed' });
        await consumer.run({ eachMessage: handlePostLifecycleEvent });
        consumerLogger.info('Kafka Consumer: Post events consumer is running.', { type: 'KafkaConsumerControl.Running' });
    } catch (error: any) {
        consumerLogger.error(`Kafka Consumer: Failed to start`, { clientId, error: error.message, type: 'KafkaConsumerControl.StartError' });
        if (consumer) await consumer.disconnect().catch(() => {});
        consumer = null;
        throw error;
    }
};

export const stopPostEventsConsumer = async (): Promise<void> => {
    if (consumer) {
        consumerLogger.info(`Kafka Consumer: Disconnecting...`, { clientId, type: 'KafkaConsumerControl.Disconnecting' });
        await consumer.disconnect();
        consumerLogger.info(`Kafka Consumer: Disconnected.`, { clientId, type: 'KafkaConsumerControl.Disconnected' });
        consumer = null;
    }
};