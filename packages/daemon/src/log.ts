import pino, { type LoggerOptions } from 'pino';

const level = process.env['FIZZ_LOG_LEVEL'] ?? 'info';

const opts: LoggerOptions = { level };

if (process.env['NODE_ENV'] !== 'production') {
  opts.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss.l' },
  };
}

export const log = pino(opts);
