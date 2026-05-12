import pino from 'pino';
import pinoHttp from 'pino-http';

export const logger = pino({
  level: process.env['NODE_ENV'] === 'test' ? 'silent' : 'info',
  transport:
    process.env['NODE_ENV'] === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

export const httpLogger = pinoHttp({ logger });
