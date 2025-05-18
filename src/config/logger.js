/**
 * @file logger.js
 * @description Configuración del sistema de logging para la aplicación
 *
 * Este archivo configura un sistema de logging flexible y completo
 * utilizando winston, con soporte para diferentes destinos, formatos
 * y niveles según el entorno.
 */

const winston = require('winston');
const { createLogger, format, transports } = winston;
const path = require('path');
const fs = require('fs');
const config = require('./environment');

// Asegurar que el directorio de logs existe
const logDirectory = path.dirname(config.logging.logFilePath);
if (config.logging.enableFile && !fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

/**
 * Formatos predefinidos para el logger
 */
const logFormats = {
    developmentConsole: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        format.colorize(),
        format.printf(info => {
            const { timestamp, level, message, ...rest } = info;
            const logMethod = Object.keys(rest).length ?
                `\n${JSON.stringify(rest, null, 2)}` : '';

            return `${timestamp} ${level}: ${message}${logMethod}`;
        })
    ),

    productionConsole: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(info => {
            const { timestamp, level, message, ...rest } = info;
            const meta = Object.keys(rest).length ?
                ` ${JSON.stringify(rest)}` : '';

            return `${timestamp} ${level}: ${message}${meta}`;
        })
    ),

    json: format.combine(
        format.timestamp(),
        format.json()
    )
};

/**
 * Crea los transportes según la configuración
 */
function createTransports() {
    const logTransports = [];

    if (config.logging.enableConsole) {
        logTransports.push(
            new transports.Console({
                level: config.logging.level,
                format: config.logging.prettyPrint ?
                    logFormats.developmentConsole :
                    logFormats.productionConsole
            })
        );
    }

    if (config.logging.enableFile) {
        logTransports.push(
            new transports.File({
                filename: config.logging.logFilePath,
                level: config.logging.level,
                format: logFormats.json,
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5,
                tailable: true
            })
        );

        logTransports.push(
            new transports.File({
                filename: path.join(
                    path.dirname(config.logging.logFilePath),
                    'error.log'
                ),
                level: 'error',
                format: logFormats.json,
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5
            })
        );
    }

    return logTransports;
}

/**
 * Crea y configura el logger
 */
const logger = createLogger({
    level: config.logging.level,
    levels: winston.config.npm.levels,
    format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
    ),
    defaultMeta: {
        service: 'electric-balance-api',
        environment: config.env
    },
    transports: createTransports(),
    exitOnError: false,
    silent: process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS
});

/**
 * Middleware de Express para logging de peticiones HTTP
 *
 * @param {Object} req - Petición HTTP
 * @param {Object} res - Respuesta HTTP
 * @param {Function} next - Función para continuar
 */
function requestLogger(req, res, next) {
    if (config.logging.excludePaths.some(path => req.path.startsWith(path))) {
        return next();
    }

    const start = Date.now();
    const requestId = req.headers['x-request-id'] ||
        req.headers['x-correlation-id'] ||
        `req-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    req.logger = logger.child({ requestId });

    req.logger.debug(`HTTP ${req.method} ${req.url}`, {
        method: req.method,
        url: req.url,
        query: req.query,
        ip: req.ip,
        userAgent: req.headers['user-agent']
    });

    res.on('finish', () => {
        const duration = Date.now() - start;
        const message = `HTTP ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`;

        const level = res.statusCode >= 500 ? 'error' :
            res.statusCode >= 400 ? 'warn' :
                'info';

        req.logger[level](message, {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration
        });
    });

    next();
}

/**
 * Middleware de Express para manejar errores
 *
 * @param {Error} err - Error producido
 * @param {Object} req - Petición HTTP
 * @param {Object} res - Respuesta HTTP
 * @param {Function} next - Función para continuar
 */
function errorLogger(err, req, res, next) {
    const logger = req.logger || module.exports;

    logger.error(`Error processing ${req.method} ${req.url}`, {
        error: {
            message: err.message,
            stack: err.stack,
            name: err.name,
            code: err.code
        },
        method: req.method,
        url: req.url,
        query: req.query,
        body: req.body,
        ip: req.ip,
        user: req.user
    });

    next(err);
}

/**
 * Extiende un objeto con métodos del logger
 *
 * @param {Object} target - Objeto a extender
 * @param {Object} source - Objeto de origen (logger)
 * @returns {Object} - Objeto extendido
 */
function extendWithLogger(target, source = logger) {
    const logMethods = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];

    logMethods.forEach(method => {
        target[method] = source[method].bind(source);
    });

    target.child = metadata => {
        const childLogger = source.child(metadata);
        return extendWithLogger({}, childLogger);
    };

    return target;
}

/**
 * Crea un logger específico para un componente
 *
 * @param {string} component - Nombre del componente
 * @param {Object} metadata - Metadatos adicionales
 * @returns {Object} - Logger con el contexto específico
 */
function createComponentLogger(component, metadata = {}) {
    return logger.child({
        component,
        ...metadata
    });
}

/**
 * Crea un logger específico para una petición GraphQL
 *
 * @param {Object} info - Información de la operación GraphQL
 * @returns {Object} - Logger con el contexto específico
 */
function createGraphQLLogger(info) {
    return logger.child({
        operation: info.operation?.operation || 'query',
        operationName: info.operationName,
        fieldName: info.fieldName,
        variables: info.variableValues,
        graphql: true
    });
}

module.exports = extendWithLogger({
    requestLogger,
    errorLogger,
    createComponentLogger,
    createGraphQLLogger,
    stream: {
        write: message => {
            logger.info(message.trim());
        }
    }
});
