import * as winston from 'winston';
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
// Define format for logs with structured logging support
const developmentFormat = winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }), winston.format.colorize({ all: true }), winston.format.printf((info) => {
    const { timestamp, level, message, stack, correlationId, ...meta } = info;
    let logMessage = `${timestamp} ${level}: ${message}`;
    // Add correlation ID if present
    if (correlationId) {
        logMessage += ` [${correlationId}]`;
    }
    // Add stack trace if present
    if (stack) {
        logMessage += `\n${stack}`;
    }
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
        logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return logMessage;
}));
// Production format with structured JSON logging
const productionFormat = winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json(), winston.format.printf((info) => {
    // Ensure correlation ID is at the top level for easy filtering
    const { correlationId, ...rest } = info;
    return JSON.stringify({
        correlationId,
        ...rest
    });
}));
// Choose format based on environment
const format = process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat;
// Define transports
const transports = [
    // Console transport
    new winston.transports.Console({
        level: level(),
        format,
    }),
];
// Add file transport if LOG_FILE is specified
if (process.env.LOG_FILE) {
    transports.push(new winston.transports.File({
        filename: process.env.LOG_FILE,
        level: process.env.LOG_LEVEL || 'info',
        format: productionFormat, // Always use structured format for file logging
    }));
}
// Add error file transport for error-level logs
if (process.env.ERROR_LOG_FILE) {
    transports.push(new winston.transports.File({
        filename: process.env.ERROR_LOG_FILE,
        level: 'error',
        format: productionFormat,
    }));
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
    write: (message) => {
        logger.http(message.trim());
    },
};
