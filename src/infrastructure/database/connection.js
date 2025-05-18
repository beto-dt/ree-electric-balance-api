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

// Variables para el estado de la conexión
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
            // Validar configuración
            if (!config || !config.uri) {
                throw new ConfigurationError(
                    'MongoDB connection URI is required',
                    { configKey: 'mongodb.uri' }
                );
            }

            // Si ya hay una conexión establecida, devolverla
            if (isConnected) {
                logger.info('Using existing MongoDB connection');
                return mongoose.connection;
            }

            // Si ya hay un intento de conexión en curso, esperar a que termine
            if (isConnecting) {
                logger.info('Connection attempt already in progress, waiting...');
                await this._waitForConnection();
                return mongoose.connection;
            }

            // Iniciar nuevo intento de conexión
            isConnecting = true;
            connectionAttempts = 0;

            // Configurar opciones por defecto si no se proporcionan
            const options = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                maxPoolSize: 10,
                socketTimeoutMS: 45000,
                family: 4,  // Usar IPv4, omitir para permitir IPv6
                ...config.options
            };

            // Configurar eventos de conexión
            this._setupConnectionEvents(logger);

            // Intentar conectar
            logger.info('Connecting to MongoDB...');
            await mongoose.connect(config.uri, options);

            isConnected = true;
            isConnecting = false;
            logger.info('Successfully connected to MongoDB');

            return mongoose.connection;
        } catch (error) {
            isConnecting = false;
            logger.error(`Failed to connect to MongoDB: ${error.message}`, error);

            // Intentar reconexión si es un error de conexión
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
     * Obtiene la conexión actual o inicia una nueva
     *
     * @param {Object} config - Configuración de conexión
     * @param {Object} logger - Logger para registrar eventos
     * @returns {Promise<mongoose.Connection>} - Conexión de Mongoose
     */
    async getConnection(config, logger = console) {
        if (!isConnected) {
            return this.initialize(config, logger);
        }
        return mongoose.connection;
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
            // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
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
        const delay = Math.pow(2, connectionAttempts) * 1000; // Backoff exponencial

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

        // Cuando la conexión se establece correctamente
        connection.on('connected', () => {
            isConnected = true;
            isConnecting = false;
            logger.info('MongoDB connection established');
        });

        // Cuando la conexión se cierra
        connection.on('disconnected', () => {
            isConnected = false;
            logger.info('MongoDB connection disconnected');
        });

        // Cuando hay un error en la conexión
        connection.on('error', (err) => {
            logger.error(`MongoDB connection error: ${err.message}`, err);

            if (isConnected) {
                // Si estábamos conectados, la conexión se perdió
                isConnected = false;
            }
        });

        // Cuando la conexión está lista para ser usada
        connection.once('open', () => {
            logger.info('MongoDB connection ready');
        });

        // Para depuración - eventos adicionales
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

            // Verificar que la conexión está realmente viva con una operación simple
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

    /**
     * Obtiene información sobre la base de datos
     *
     * @returns {Promise<Object>} - Información de la base de datos
     */
    async getDatabaseInfo() {
        if (!isConnected) {
            throw new Error('Not connected to MongoDB');
        }

        try {
            const connection = mongoose.connection;
            const adminDb = connection.db.admin();

            // Obtener información del servidor
            const serverStatus = await adminDb.serverStatus();

            // Obtener estadísticas de la base de datos
            const dbStats = await connection.db.stats();

            // Obtener nombres de colecciones
            const collections = await connection.db.listCollections().toArray();

            return {
                dbName: connection.db.databaseName,
                host: serverStatus.host,
                version: serverStatus.version,
                collections: collections.map(col => col.name),
                stats: {
                    collections: dbStats.collections,
                    documents: dbStats.objects,
                    dataSize: `${(dbStats.dataSize / (1024 * 1024)).toFixed(2)} MB`,
                    storageSize: `${(dbStats.storageSize / (1024 * 1024)).toFixed(2)} MB`,
                    indices: dbStats.indexes,
                    indexSize: `${(dbStats.indexSize / (1024 * 1024)).toFixed(2)} MB`
                },
                connectionPoolSize: serverStatus.connections.current,
                timestamp: new Date()
            };
        } catch (error) {
            throw new Error(`Failed to get database info: ${error.message}`);
        }
    }
};

module.exports = MongoConnection;
