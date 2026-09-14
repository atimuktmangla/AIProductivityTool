import pino from 'pino';
import pinoHttp from 'pino-http';

const level = process.env.LOG_LEVEL ?? 'info';

export const logger = pino({
  level,
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino/file', options: { destination: 1 } },
  }),
});

export const httpLogger = pinoHttp({ logger, autoLogging: true });
