import { Client } from '@elastic/elasticsearch';
import winston from 'winston';
import { IndexedPost } from '../models/post.model';

const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const INDEX_NAME = process.env.ELASTICSEARCH_INDEX_NAME || 'posts';

let client: Client | null = null;
let esLogger: winston.Logger;

export const initializeElasticsearchClient = (logger: winston.Logger) => {
    esLogger = logger;
    esLogger.info('Initializing Elasticsearch Client', { node: ELASTICSEARCH_NODE, type: 'ESClient.Init' });
    client = new Client({
        node: ELASTICSEARCH_NODE,
        maxRetries: 5,
        requestTimeout: 60000,
    });
};

const getClient = (): Client => {
    if (!client) {
        throw new Error("Elasticsearch client has not been initialized. Call initializeElasticsearchClient first.");
    }
    return client;
};

export const ensureIndexExists = async (correlationId?: string) => {
    const esClient = getClient();
    try {
        const indexExists = await esClient.indices.exists({ index: INDEX_NAME });
        if (!indexExists) {
            esLogger.info(`Index "${INDEX_NAME}" does not exist. Creating it.`, { correlationId, index: INDEX_NAME, type: 'ESClient.CreateIndex' });
            await esClient.indices.create({
                index: INDEX_NAME,
                mappings: {
                    properties: {
                        postId: { type: 'keyword' },
                        userId: { type: 'keyword' },
                        title: { type: 'text', analyzer: 'english' },
                        content: { type: 'text', analyzer: 'english' },
                        createdAt: { type: 'date' },
                        updatedAt: { type: 'date' },
                        likeCount: { type: 'integer' }
                    }
                }
            });
            esLogger.info(`Index "${INDEX_NAME}" created successfully.`, { correlationId, index: INDEX_NAME, type: 'ESClient.CreateIndexSuccess' });
        }
    } catch (error: any) {
        esLogger.error('Error ensuring index exists', { correlationId, index: INDEX_NAME, error: error.message, stack: error.stack, type: 'ESClient.CreateIndexError' });
        throw error;
    }
};

export const indexPost = async (post: IndexedPost, correlationId?: string): Promise<void> => {
    const esClient = getClient();
    try {
        esLogger.info('Indexing post', { correlationId, postId: post.postId, index: INDEX_NAME, type: 'ESClient.IndexPost' });
        await esClient.index({
            index: INDEX_NAME,
            id: post.postId,
            document: post,
            refresh: 'wait_for', // Ensures the document is searchable immediately after
        });
        esLogger.info('Successfully indexed post', { correlationId, postId: post.postId, type: 'ESClient.IndexPostSuccess' });
    } catch (error: any) {
        esLogger.error('Error indexing post', { correlationId, postId: post.postId, error: error.message, stack: error.stack, type: 'ESClient.IndexPostError' });
    }
};

// Note: post-service doesn't currently emit a PostDeleted event. This is for future use.
export const deletePost = async (postId: string, correlationId?: string): Promise<void> => {
    const esClient = getClient();
     try {
        esLogger.info('Deleting post from index', { correlationId, postId, index: INDEX_NAME, type: 'ESClient.DeletePost' });
        await esClient.delete({
            index: INDEX_NAME,
            id: postId,
        });
        esLogger.info('Successfully deleted post', { correlationId, postId, type: 'ESClient.DeletePostSuccess' });
    } catch (error: any) {
        // A 404 error is okay, it means the document was already gone.
        if (error.statusCode === 404) {
            esLogger.warn('Attempted to delete post not found in index', { correlationId, postId, type: 'ESClient.DeletePostNotFound' });
            return;
        }
        esLogger.error('Error deleting post', { correlationId, postId, error: error.message, stack: error.stack, type: 'ESClient.DeletePostError' });
    }
};

export const searchPosts = async (query: string, correlationId?: string): Promise<IndexedPost[]> => {
    const esClient = getClient();
    try {
        esLogger.info('Searching posts', { correlationId, query, index: INDEX_NAME, type: 'ESClient.Search' });
        const response = await esClient.search<IndexedPost>({
            index: INDEX_NAME,
            query: {
                multi_match: {
                    query: query,
                    fields: ["title^2", "content"], // Boost title matches
                    fuzziness: "AUTO"
                }
            }
        });

        const posts = response.hits.hits.map(hit => hit._source as IndexedPost);
        esLogger.info(`Search successful, found ${posts.length} results`, { correlationId, count: posts.length, type: 'ESClient.SearchSuccess' });
        return posts;
    } catch (error: any) {
        esLogger.error('Error searching posts', { correlationId, query, error: error.message, stack: error.stack, type: 'ESClient.SearchError' });
        return [];
    }
};