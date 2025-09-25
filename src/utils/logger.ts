import winston from 'winston';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${
      info.stack ? `\n${info.stack}` : ''
    }${
      Object.keys(info).length > 3 
        ? `\n${JSON.stringify(
            Object.fromEntries(
              Object.entries(info).filter(([key]) => !['timestamp', 'level', 'message', 'stack'].includes(key))
            ), 
            null, 
            2
          )}` 
        : ''
    }`
  ),
);

// Define transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    level: level(),
    format,
  }),
];

// Add file transport if LOG_FILE is specified
if (process.env.LOG_FILE) {
  transports.push(
    new winston.transports.File({
      filename: process.env.LOG_FILE,
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
        winston.format.printf(
          (info) => `${info.timestamp} ${info.level}: ${info.message}${
            info.stack ? `\n${info.stack}` : ''
          }${
            Object.keys(info).length > 3 
              ? `\n${JSON.stringify(
                  Object.fromEntries(
                    Object.entries(info).filter(([key]) => !['timestamp', 'level', 'message', 'stack'].includes(key))
                  ), 
                  null, 
                  2
                )}` 
              : ''
          }`
        ),
      ),
    })
  );
}

// Create the logger
export const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
});

// Create a stream object for Morgan HTTP logging
export const loggerStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};