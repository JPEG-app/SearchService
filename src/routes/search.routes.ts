import express from 'express';
import { SearchController } from '../controllers/search.controller';
import { SearchService } from '../services/search.service';
import winston from 'winston';

const router = express.Router();

export const setupSearchRoutes = (logger: winston.Logger) => {
  const searchService = new SearchService(logger);
  const searchController = new SearchController(searchService, logger);

  // The main search endpoint. It's public and doesn't require authentication.
  router.get('/search', searchController.searchPosts.bind(searchController));
  
  return router;
};