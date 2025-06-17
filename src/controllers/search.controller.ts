import { Response } from 'express';
import { SearchService } from '../services/search.service';
import { RequestWithId } from '../utils/logger';
import winston from 'winston';

export class SearchController {
  private searchService: SearchService;
  private logger: winston.Logger;

  constructor(searchService: SearchService, loggerInstance: winston.Logger) {
    this.searchService = searchService;
    this.logger = loggerInstance;
  }

  async searchPosts(req: RequestWithId, res: Response) {
    const correlationId = req.id;
    const query = req.query.q as string;

    this.logger.info('SearchController: searchPosts initiated', { correlationId, query, type: 'ControllerLog.Search' });

    if (!query) {
      this.logger.warn('SearchController: Missing required query parameter "q"', { correlationId, type: 'ControllerValidation.MissingQuery' });
      return res.status(400).json({ message: 'Missing required query parameter "q"', correlationId });
    }

    try {
      const posts = await this.searchService.search(query, correlationId);
      this.logger.info('SearchController: searchPosts successful', { correlationId, count: posts.length, type: 'ControllerLog.SearchSuccess' });
      res.status(200).json(posts);
    } catch (error: any) {
      this.logger.error('SearchController: searchPosts - Internal server error', { correlationId, error: error.message, stack: error.stack, type: 'ControllerError.Search' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }
}