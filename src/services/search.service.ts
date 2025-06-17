import winston from 'winston';
import { IndexedPost } from '../models/post.model';
import * as elasticsearchClient from '../clients/elasticsearch.client';

export class SearchService {
  private logger: winston.Logger;

  constructor(loggerInstance: winston.Logger) {
    this.logger = loggerInstance;
  }

  async search(query: string, correlationId?: string): Promise<IndexedPost[]> {
    this.logger.info('SearchService: search initiated', { correlationId, query, type: 'ServiceLog.Search' });
    if (!query || query.trim().length === 0) {
        this.logger.warn('SearchService: search query is empty', { correlationId, type: 'ServiceValidation.EmptyQuery' });
        return [];
    }
    const results = await elasticsearchClient.searchPosts(query, correlationId);
    this.logger.info(`SearchService: search completed, found ${results.length} results`, { correlationId, count: results.length, type: 'ServiceLog.SearchResult' });
    return results;
  }
}