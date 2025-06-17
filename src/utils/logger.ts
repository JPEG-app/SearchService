import winston from 'winston';
import { NextFunction, Request as ExpressRequest, Response } from 'express';
import addRequestId from 'express-request-id';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithId extends ExpressRequest {
  id?: string;
  authUserId?: string; // Kept for consistency, though this service is unauthenticated
  startTime?: number;
}

export const assignRequestId = addRequestId({
    setHeader: true,
    headerName: 'X-Correlation-ID',
    generator: (req: ExpressRequest) => {
        const incomingId = req.headers['x-correlation-id'] || req.headers['X-Correlation-ID'];
        if (incomingId && typeof incomingId === 'string') {
            return incomingId;
        }
        return uuidv4();
    }
});

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;

// Changed default service name
const serviceName = process.env.SERVICE_NAME || 'search-service';

const baseFormat = combine(
  timestamp(),
  errors({ stack: true }), 
  splat(), 
  winston.format(info => { 
    info.service = serviceName;
    return info;
  })()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: baseFormat,
  transports: [],
  defaultMeta: { service: serviceName }, 
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      printf(({ level, message, timestamp, service, correlationId, type, stack, ...rest }) => {
        let log = `${timestamp} [${service}] ${level}`;
        if (correlationId) log += ` [correlationId: ${correlationId}]`;
        if (type) log += ` [type: ${type}]`;
        log += `: ${message}`;
        const remainingMeta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
        log += remainingMeta;
        if (stack) log += `\n${stack}`;
        return log;
      })
    ),
  }));
} else {
  logger.add(new winston.transports.Console({
    format: json(),
  }));
}

export const requestLogger = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const typedReq = req as RequestWithId;
  typedReq.startTime = Date.now();
  typedReq.id = typedReq.id || req.headers['x-correlation-id']?.toString() || uuidv4();

  logger.info(`Incoming request`, {
    correlationId: typedReq.id, 
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    type: 'RequestLog.Start'
  });

  res.on('finish', () => {
    const duration = Date.now() - (typedReq.startTime || Date.now());
    logger.info(`Request finished`, {
      correlationId: typedReq.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      type: 'RequestLog.Finish',
    });
  });
  next();
};

export default logger;