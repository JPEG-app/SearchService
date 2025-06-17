import express, { Application, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { setupSearchRoutes } from './routes/search.routes';
import logger, { assignRequestId, requestLogger, RequestWithId } from './utils/logger';

export class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.errorHandling();
  }

  private config(): void {
    this.app.use(assignRequestId);
    this.app.use(cors({ origin: '*' })); // Simplified CORS for a public search API
    this.app.use(bodyParser.json());
    this.app.use(requestLogger);
  }

  private routes(): void {
    this.app.use('/', setupSearchRoutes(logger));
  }

  private errorHandling(): void {
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      const typedReq = req as RequestWithId;
      logger.error('Unhandled error in Express', { 
          correlationId: typedReq.id,
          error: err.message, 
          stack: err.stack,
          type: 'ExpressError' 
      });
      res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        correlationId: typedReq.id,
      });
    });
  }
}