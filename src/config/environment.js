/**
 * @file environment.js
 * @description Configuración de variables de entorno para la aplicación
 *
 * Este archivo carga y valida las variables de entorno necesarias para
 * el funcionamiento de la aplicación, proporcionando valores por defecto
 * cuando es apropiado.
 */

require('dotenv').config();

/**
 * Obtiene una variable de entorno
 *
 * @param {string} key - Nombre de la variable
 * @param {*} defaultValue - Valor por defecto si no existe
 * @param {Function} transform - Función para transformar el valor
 * @returns {*} - Valor de la variable
 */
function getEnv(key, defaultValue = undefined, transform = null) {
    const value = process.env[key] !== undefined ? process.env[key] : defaultValue;

    if (value === undefined) {
        throw new Error(`Environment variable ${key} is required but not set`);
    }

    return transform && value !== undefined ? transform(value) : value;
}

/**
 * Convierte un string a booleano
 *
 * @param {string} value - Valor a convertir
 * @returns {boolean} - Valor convertido
 */
function toBoolean(value) {
    return ['true', 'yes', '1', true].includes(value);
}

/**
 * Convierte un string a número
 *
 * @param {string} value - Valor a convertir
 * @returns {number} - Valor convertido
 */
function toNumber(value) {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
}

/**
 * Convierte un string a array
 *
 * @param {string} value - Valor a convertir (separado por comas)
 * @returns {Array<string>} - Array de strings
 */
function toArray(value) {
    if (!value) return [];
    return value.split(',').map(item => item.trim());
}

/**
 * Convierte un string a objeto
 *
 * @param {string} value - Valor a convertir (formato JSON)
 * @returns {Object} - Objeto parseado
 */
function toObject(value) {
    try {
        return value ? JSON.parse(value) : {};
    } catch (error) {
        console.warn(`Error parsing JSON from environment variable: ${error.message}`);
        return {};
    }
}

/**
 * Configuración de la aplicación basada en variables de entorno
 */
const config = {
    // Entorno y configuración general
    env: getEnv('NODE_ENV', 'development'),
    isDevelopment: getEnv('NODE_ENV', 'development') === 'development',
    isProduction: getEnv('NODE_ENV', 'development') === 'production',
    isTest: getEnv('NODE_ENV', 'development') === 'test',

    // Servidor
    server: {
        port: getEnv('PORT', 4000, toNumber),
        host: getEnv('HOST', 'localhost'),
        baseUrl: getEnv('BASE_URL', 'http://localhost:4000'),
        corsEnabled: getEnv('CORS_ENABLED', true, toBoolean),
        corsOrigins: getEnv('CORS_ORIGINS', '*', toArray),
        trustProxy: getEnv('TRUST_PROXY', false, toBoolean),
        requestTimeout: getEnv('REQUEST_TIMEOUT', 60000, toNumber), // 60 segundos
        bodyLimit: getEnv('BODY_LIMIT', '10mb')
    },

    // Base de datos MongoDB
    mongodb: {
        uri: getEnv('MONGODB_URI', 'mongodb://localhost:27017/electric-balance'),
        dbName: getEnv('MONGODB_DB_NAME', 'electric-balance'),
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: getEnv('MONGODB_POOL_SIZE', 10, toNumber),
            serverSelectionTimeoutMS: getEnv('MONGODB_TIMEOUT', 30000, toNumber),
            socketTimeoutMS: getEnv('MONGODB_SOCKET_TIMEOUT', 45000, toNumber),
            family: getEnv('MONGODB_IP_FAMILY', 4, toNumber), // 4 para IPv4, 6 para IPv6
            authSource: getEnv('MONGODB_AUTH_SOURCE', 'admin')
        }
    },

    // API de REE
    ree: {
        baseUrl: getEnv('REE_API_BASE_URL', 'https://apidatos.ree.es'),
        timeout: getEnv('REE_API_TIMEOUT', 10000, toNumber), // 10 segundos
        retryAttempts: getEnv('REE_API_RETRY_ATTEMPTS', 3, toNumber),
        retryDelay: getEnv('REE_API_RETRY_DELAY', 1000, toNumber), // 1 segundo
        // Headers adicionales, si se necesitan
        headers: toObject(getEnv('REE_API_HEADERS', '{}'))
    },

    // Tareas programadas
    scheduling: {
        enabled: getEnv('SCHEDULED_TASKS_ENABLED', true, toBoolean),
        timeZone: getEnv('SCHEDULED_TASKS_TIMEZONE', 'Europe/Madrid'),
        // Expresión cron para la tarea de obtención de datos horarios
        hourlyFetchCron: getEnv('HOURLY_FETCH_CRON', '0 */1 * * *'), // Cada hora
        // Expresión cron para la tarea de obtención de datos diarios
        dailyFetchCron: getEnv('DAILY_FETCH_CRON', '0 4 * * *'), // Cada día a las 4 AM
        // Expresión cron para la tarea de obtención de datos mensuales
        monthlyFetchCron: getEnv('MONTHLY_FETCH_CRON', '0 5 1 * *'), // Primer día del mes a las 5 AM
        initialFetch: getEnv('INITIAL_FETCH_ENABLED', true, toBoolean),
        // Períodos históricos a obtener (en días)
        historicalPeriods: {
            hour: getEnv('HISTORICAL_HOURS_DAYS', 2, toNumber), // 2 días de datos horarios
            day: getEnv('HISTORICAL_DAYS_DAYS', 60, toNumber), // 60 días de datos diarios
            month: getEnv('HISTORICAL_MONTHS_DAYS', 365, toNumber), // 1 año de datos mensuales
            year: getEnv('HISTORICAL_YEARS_DAYS', 1825, toNumber) // 5 años de datos anuales
        }
    },

    // GraphQL
    graphql: {
        path: getEnv('GRAPHQL_PATH', '/graphql'),
        introspection: getEnv('GRAPHQL_INTROSPECTION', true, toBoolean),
        playground: getEnv('GRAPHQL_PLAYGROUND', true, toBoolean),
        debug: getEnv('GRAPHQL_DEBUG', true, toBoolean),
        tracing: getEnv('GRAPHQL_TRACING', false, toBoolean),
        maxDepth: getEnv('GRAPHQL_MAX_DEPTH', 10, toNumber),
        maxComplexity: getEnv('GRAPHQL_MAX_COMPLEXITY', 1000, toNumber)
    },

    // Apollo Server
    apollo: {
        reportingEnabled: getEnv('APOLLO_REPORTING_ENABLED', false, toBoolean),
        graphRef: getEnv('APOLLO_GRAPH_REF', ''),
        apiKey: getEnv('APOLLO_KEY', '')
    },

    // Logging
    logging: {
        level: getEnv('LOG_LEVEL', 'info'),
        prettyPrint: getEnv('LOG_PRETTY_PRINT', !getEnv('NODE_ENV', 'development') === 'production', toBoolean),
        enableConsole: getEnv('LOG_ENABLE_CONSOLE', true, toBoolean),
        enableFile: getEnv('LOG_ENABLE_FILE', getEnv('NODE_ENV', 'development') === 'production', toBoolean),
        logFilePath: getEnv('LOG_FILE_PATH', './logs/app.log'),
        excludePaths: getEnv('LOG_EXCLUDE_PATHS', '/health,/metrics,/favicon.ico', toArray)
    },

    // Cache
    cache: {
        enabled: getEnv('CACHE_ENABLED', true, toBoolean),
        ttl: getEnv('CACHE_TTL', 300, toNumber), // 5 minutos en segundos
        maxItems: getEnv('CACHE_MAX_ITEMS', 1000, toNumber)
    },

    // CORS
    cors: {
        origins: getEnv('CORS_ORIGINS', '*', toArray),
        methods: getEnv('CORS_METHODS', 'GET,POST,OPTIONS', toArray),
        allowedHeaders: getEnv('CORS_ALLOWED_HEADERS', 'Content-Type,Authorization', toArray),
        exposedHeaders: getEnv('CORS_EXPOSED_HEADERS', '', toArray),
        credentials: getEnv('CORS_CREDENTIALS', false, toBoolean),
        maxAge: getEnv('CORS_MAX_AGE', 86400, toNumber) // 24 horas en segundos
    }
};

module.exports = config;
