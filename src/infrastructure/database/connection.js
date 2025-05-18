/**
 * @file connection.js
 * @description Configuración y gestión de la conexión a MongoDB
 *
 * Este archivo maneja la conexión a la base de datos MongoDB,
 * incluyendo opciones de configuración, reconexión automática,
 * y eventos de conexión.
 */

const mongoose = require('mongoose');
const { ConfigurationError } = require('../../application/errors/ApplicationErrors');

let isConnected = false;
let isConnecting = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Objeto que encapsula la funcionalidad de conexión a MongoDB
 */
const MongoConnection = {
    /**
     * Inicializa la conexión a MongoDB
     *
     * @param {Object} config - Configuración de la conexión
     * @param {string} config.uri - URI de conexión de MongoDB
     * @param {Object} config.options - Opciones de conexión de Mongoose
     * @param {Object} logger - Logger para registrar eventos
     * @returns {Promise<mongoose.Connection>} - Conexión de Mongoose
     * @throws {ConfigurationError} - Si hay problemas con la configuración
     */
    async initialize(config, logger = console) {
        try {
            if (!config || !config.uri) {
                throw new ConfigurationError(
                    'MongoDB connection URI is required',
                    { configKey: 'mongodb.uri' }
                );
            }

            if (isConnected) {
                logger.info('Using existing MongoDB connection');
                return mongoose.connection;
            }

            if (isConnecting) {
                logger.info('Connection attempt already in progress, waiting...');
                await this._waitForConnection();
                return mongoose.connection;
            }

            isConnecting = true;
            connectionAttempts = 0;

            const options = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                maxPoolSize: 10,
                socketTimeoutMS: 45000,
                family: 4,
                ...config.options
            };

            this._setupConnectionEvents(logger);

            logger.info('Connecting to MongoDB...');
            await mongoose.connect(config.uri, options);

            isConnected = true;
            isConnecting = false;
            logger.info('Successfully connected to MongoDB');

            return mongoose.connection;
        } catch (error) {
            isConnecting = false;
            logger.error(`Failed to connect to MongoDB: ${error.message}`, error);

            if (error.name === 'MongoError' || error.name === 'MongooseError') {
                await this._attemptReconnection(config, logger);
            } else {
                throw new ConfigurationError(
                    `MongoDB connection error: ${error.message}`,
                    { originalError: error }
                );
            }
        }
    },

    /**
     * Cierra la conexión a MongoDB
     *
     * @param {Object} logger - Logger para registrar eventos
     * @returns {Promise<void>}
     */
    async close(logger = console) {
        if (isConnected) {
            logger.info('Closing MongoDB connection...');
            await mongoose.disconnect();
            isConnected = false;
            logger.info('MongoDB connection closed');
        }
    },

    /**
     * Verifica el estado de la conexión
     *
     * @returns {Object} - Estado de la conexión
     */
    getStatus() {
        return {
            isConnected,
            isConnecting,
            readyState: mongoose.connection.readyState,
            connectionAttempts
        };
    },

    /**
     * Intenta la reconexión con backoff exponencial
     *
     * @param {Object} config - Configuración de conexión
     * @param {Object} logger - Logger para registrar eventos
     * @returns {Promise<mongoose.Connection>} - Conexión de Mongoose
     * @private
     */
    async _attemptReconnection(config, logger) {
        if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
            throw new ConfigurationError(
                `Failed to connect to MongoDB after ${MAX_RECONNECT_ATTEMPTS} attempts`,
                { configKey: 'mongodb.uri' }
            );
        }

        connectionAttempts++;
        const delay = Math.pow(2, connectionAttempts) * 1000;

        logger.info(`Reconnecting to MongoDB in ${delay}ms (attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.initialize(config, logger);
    },

    /**
     * Espera a que la conexión en curso termine
     *
     * @returns {Promise<void>}
     * @private
     */
    async _waitForConnection() {
        return new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (!isConnecting) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    },

    /**
     * Configura los eventos de la conexión de Mongoose
     *
     * @param {Object} logger - Logger para registrar eventos
     * @private
     */
    _setupConnectionEvents(logger) {
        const connection = mongoose.connection;

        connection.on('connected', () => {
            isConnected = true;
            isConnecting = false;
            logger.info('MongoDB connection established');
        });

        connection.on('disconnected', () => {
            isConnected = false;
            logger.info('MongoDB connection disconnected');
        });

        connection.on('error', (err) => {
            logger.error(`MongoDB connection error: ${err.message}`, err);

            if (isConnected) {
                isConnected = false;
            }
        });

        connection.once('open', () => {
            logger.info('MongoDB connection ready');
        });

        if (process.env.NODE_ENV === 'development') {
            connection.on('reconnected', () => {
                logger.debug('MongoDB reconnected');
            });

            connection.on('reconnectFailed', () => {
                logger.warn('MongoDB reconnect attempts exhausted');
            });

            connection.on('reconnectTries', () => {
                logger.debug(`MongoDB reconnect attempt`);
            });
        }
    },

    /**
     * Verifica el estado de salud de la conexión
     *
     * @returns {Promise<Object>} - Estado de salud
     */
    async healthCheck() {
        try {
            if (!isConnected) {
                return {
                    status: 'disconnected',
                    message: 'Not connected to MongoDB',
                    timestamp: new Date()
                };
            }

            const adminDb = mongoose.connection.db.admin();
            const result = await adminDb.ping();

            return {
                status: 'healthy',
                message: 'MongoDB connection is healthy',
                ping: result.ok === 1 ? 'success' : 'failed',
                timestamp: new Date()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                message: `MongoDB health check failed: ${error.message}`,
                error: error.message,
                timestamp: new Date()
            };
        }
    },
};

module.exports = MongoConnection;
