/**
 * @file index.js
 * @description Punto de entrada principal de la aplicación
 *
 * Este archivo inicializa el servidor, configura los middlewares,
 * establece las conexiones a servicios externos y arranca la aplicación.
 */

// Importar dependencias
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const path = require('path');

// Importar configuración
const config = require('./config/environment');
const logger = require('./config/logger');
const { schedulerManager } = require('./config/schedulers');

// Importar servicios y repositorios
const MongoConnection = require('./infrastructure/database/connection');
const REEApiService = require('./infrastructure/external/REEApiService');
const MongoElectricBalanceRepository = require('./infrastructure/repositories/MongoElectricBalanceRepository');
const ElectricBalanceService = require('./domain/services/ElectricBalanceService');

// Importar GraphQL server
const createGraphQLServer = require('./infrastructure/graphql/server');

// Crear aplicación Express
const app = express();

// Array para almacenar los servicios inicializados
const initializedServices = [];


function getCorsOptions() {
    return {
        origin:'*',
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'apollo-require-preflight']
    };
}

/**
 * Intenta iniciar el servidor HTTP en un puerto, con reintento automático
 * si el puerto está ocupado.
 *
 * @param {http.Server} server - Servidor HTTP
 * @param {number} port - Puerto inicial a intentar
 * @param {number} maxAttempts - Número máximo de intentos
 * @param {number} currentAttempt - Intento actual
 * @returns {Promise<number>} - Puerto en el que se inició el servidor
 */
function tryListen(server, port, maxAttempts = 10, currentAttempt = 1) {
    return new Promise((resolve, reject) => {
        // Manejador para errores de escucha
        const errorHandler = (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.warn(`Port ${port} is already in use`);

                if (currentAttempt < maxAttempts) {
                    const nextPort = port + 1;
                    logger.info(`Trying port ${nextPort} (attempt ${currentAttempt + 1}/${maxAttempts})`);
                    // Intentar con el siguiente puerto
                    server.removeListener('error', errorHandler);
                    tryListen(server, nextPort, maxAttempts, currentAttempt + 1)
                        .then(resolve)
                        .catch(reject);
                } else {
                    reject(new Error(`Could not find an available port after ${maxAttempts} attempts`));
                }
            } else {
                reject(error);
            }
        };

        // Configurar evento de error
        server.once('error', errorHandler);

        // Intentar escuchar en el puerto
        server.listen(port, () => {
            server.removeListener('error', errorHandler);
            resolve(port);
        });
    });
}

/**
 * Función principal para inicializar la aplicación
 */
async function bootstrap() {
    try {
        console.log('\n==== INICIANDO APLICACIÓN ====');
        logger.info(`Starting Electric Balance API in ${config.env} mode`);
        logger.info(`Node environment: ${process.env.NODE_ENV}`);

        // Configurar middlewares básicos
        console.log('\n[BOOTSTRAP] Configurando middlewares...');
        setupMiddlewares();
        console.log('[BOOTSTRAP] Middlewares configurados.');

        // Conectar a la base de datos
        console.log('\n[BOOTSTRAP] Conectando a MongoDB...');
        const mongoConnection = await connectToDatabase();
        initializedServices.push({ name: 'MongoDB', instance: mongoConnection });
        console.log('[BOOTSTRAP] Conexión a MongoDB establecida.');

        // Inicializar repositorios
        console.log('\n[BOOTSTRAP] Inicializando repositorios...');
        const repositories = initializeRepositories();
        console.log('[BOOTSTRAP] Repositorios inicializados.');

        // Inicializar servicios
        console.log('\n[BOOTSTRAP] Inicializando servicios...');
        const services = initializeServices(repositories);
        console.log('[BOOTSTRAP] Servicios inicializados.');

        // Configurar rutas de API REST básicas - ANTES de GraphQL
        console.log('\n[BOOTSTRAP] Configurando rutas básicas...');
        setupBasicRoutes();
        console.log('[BOOTSTRAP] Rutas básicas configuradas.');

        // Inicializar servidor GraphQL
        console.log('\n[BOOTSTRAP] Configurando servidor GraphQL...');
        const graphqlServer = await setupGraphQLServer(repositories, services);
        initializedServices.push({ name: 'GraphQL Server', instance: graphqlServer });
        console.log('[BOOTSTRAP] Servidor GraphQL configurado.');

        // Inicializar tareas programadas
        if (config.scheduling.enabled) {
            console.log('\n[BOOTSTRAP] Inicializando tareas programadas...');
            await initializeSchedulers(services, repositories);
            console.log('[BOOTSTRAP] Tareas programadas inicializadas.');
        }

        // Iniciar servidor HTTP con manejo de puertos ocupados
        console.log('\n[BOOTSTRAP] Iniciando servidor HTTP...');
        const serverPort = config.server.port || 4000;
        const httpServer = http.createServer(app);

        try {
            const actualPort = await tryListen(httpServer, serverPort);
            logger.info(`Server running at http://${config.server.host}:${actualPort}`);
            logger.info(`GraphQL endpoint: http://${config.server.host}:${actualPort}${config.graphql.path}`);

            // Mostrar todas las rutas disponibles
            console.log('\n[BOOTSTRAP] Rutas disponibles:');
            app._router.stack.forEach(r => {
                if (r.route && r.route.path) {
                    console.log(`  ${Object.keys(r.route.methods).join(',')} ${r.route.path}`);
                }
            });

            // Actualizar puerto en la configuración si cambió
            if (actualPort !== serverPort) {
                config.server.port = actualPort;
                logger.info(`Port changed from ${serverPort} to ${actualPort}`);
            }

            console.log('\n==== APLICACIÓN INICIADA CORRECTAMENTE ====\n');
        } catch (error) {
            logger.error(`Failed to start server: ${error.message}`, error);
            throw error;
        }

        // Manejar señales de terminación
        setupGracefulShutdown(httpServer);

    } catch (error) {
        logger.error(`Failed to start server: ${error.message}`, error);
        console.error('\n==== ERROR AL INICIAR LA APLICACIÓN ====\n');
        console.error(error);
        process.exit(1);
    }
}

/**
 * Configura los middlewares básicos de Express
 */
function setupMiddlewares() {
    // Middleware de logging
    app.use(logger.requestLogger);

    // Configuración CORS adecuada para Apollo Studio y otros clientes
    const corsOptions = getCorsOptions();

    // Aplicar configuración CORS
    app.use(cors(corsOptions));
    // Log de configuración CORS
    logger.info(`CORS enabled with origins: ${Array.isArray(corsOptions.origin) ? corsOptions.origin.join(', ') : corsOptions.origin}`);

    // Seguridad con configuración adaptada para GraphQL
    app.use(helmet({
        // Permitir conectar a Apollo Studio
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'", "https://studio.apollographql.com", "*"],
                connectSrc: ["'self'", "https://studio.apollographql.com", "*"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://studio.apollographql.com", "*"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://studio.apollographql.com", "*"],
                imgSrc: ["'self'", "data:", "https://studio.apollographql.com", "*"]
            }
        }
    }));

    app.use(compression());

    // Parseo de JSON y urlencoded
    app.use(express.json({ limit: config.server.bodyLimit }));
    app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));

    // Servir archivos estáticos (documentación, etc.)
    app.use('/docs', express.static(path.join(__dirname, '../docs')));

    // Timeout para peticiones largas
    app.use((req, res, next) => {
        res.setTimeout(config.server.requestTimeout, () => {
            logger.warn(`Request timeout: ${req.method} ${req.url}`);
            res.status(408).send('Request Timeout');
        });
        next();
    });

    // Middleware para options preflight de CORS
    app.options('*', cors(corsOptions));

    logger.debug('Express middlewares configured');
}

/**
 * Conecta a la base de datos MongoDB
 *
 * @returns {Promise<Object>} Conexión a MongoDB
 */
async function connectToDatabase() {
    logger.info('Connecting to MongoDB...');

    try {
        const connection = await MongoConnection.initialize(config.mongodb, logger);
        logger.info('Successfully connected to MongoDB');

        // Pequeño retraso para asegurar que la conexión está estable
        await new Promise(resolve => setTimeout(resolve, 1000));

        return connection;
    } catch (error) {
        logger.error(`Failed to connect to MongoDB: ${error.message}`, error);
        throw error;
    }
}

/**
 * Inicializa los repositorios
 *
 * @returns {Object} Objeto con los repositorios inicializados
 */
function initializeRepositories() {
    logger.info('Initializing repositories');

    const electricBalanceRepository = new MongoElectricBalanceRepository(
        logger.createComponentLogger('ElectricBalanceRepository')
    );

    logger.debug('Repositories initialized');

    return {
        electricBalanceRepository
    };
}

/**
 * Inicializa los servicios
 *
 * @param {Object} repositories - Repositorios inicializados
 * @returns {Object} Objeto con los servicios inicializados
 */
function initializeServices(repositories) {
    logger.info('Initializing services');

    // Servicio para la API de REE
    const reeApiService = new REEApiService(
        {
            baseUrl: config.ree.baseUrl,
            timeout: config.ree.timeout,
            headers: config.ree.headers
        },
        logger.createComponentLogger('REEApiService')
    );

    // Servicio de balance eléctrico
    const electricBalanceService = new ElectricBalanceService(
        repositories.electricBalanceRepository
    );

    // Instancia de conexión MongoDB para health checks
    const mongoConnection = MongoConnection;

    logger.debug('Services initialized');

    return {
        reeApiService,
        electricBalanceService,
        mongoConnection
    };
}

/**
 * Configura rutas básicas para la API REST
 */
function setupBasicRoutes() {

    app.get('/', (req, res) => {
        res.json({
            name: 'Electric Balance API',
            message: 'Welcome to the Electric Balance API',
            links: {
                apiInfo: '/api-info',
                health: '/health',
                docs: '/docs',
                graphql: config.graphql.path
            }
        });
    });
    // Ruta de verificación de salud
    app.get('/health', async (req, res) => {
        const mongoStatus = await MongoConnection.healthCheck();

        const status = {
            status: mongoStatus.status === 'healthy' ? 'ok' : 'error',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            services: {
                mongodb: mongoStatus
            }
        };

        const statusCode = status.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(status);
    });

    // Ruta para información de la API
    app.get('/api-info', (req, res) => {
        res.json({
            name: 'Electric Balance API',
            version: process.env.npm_package_version || '1.0.0',
            description: 'API para datos de balance eléctrico de Red Eléctrica de España',
            endpoints: {
                graphql: config.graphql.path,
                health: '/health',
                docs: '/docs'
            }
        });
    });

    app.get('/force-load-data', async (req, res) => {
        try {
            logger.info('Forcing data load from REE API');

            const repository = new MongoElectricBalanceRepository(
              logger.createComponentLogger('ManualLoadRepository')
            );

            const reeService = new REEApiService(
              {
                  baseUrl: config.ree.baseUrl,
                  timeout: config.ree.timeout,
                  headers: config.ree.headers
              },
              logger.createComponentLogger('ManualLoadREEService')
            );

            // Crear una instancia del caso de uso
            const FetchREEDataClass = require('./application/use-cases/FetchREEData');
            const fetchUseCase = new FetchREEDataClass(
              reeService,
              repository,
              logger.createComponentLogger('ManualLoad')
            );

            // Fechas para los últimos 30 días
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            // Ejecutar la carga
            const result = await fetchUseCase.execute({
                startDate,
                endDate,
                timeScope: 'day',
                forceUpdate: true
            });

            res.json({
                success: true,
                message: 'Forced data load completed',
                result
            });
        } catch (error) {
            logger.error(`Error forcing data load: ${error.message}`, error);
            res.status(500).json({
                success: false,
                message: `Error: ${error.message}`,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });

    logger.debug('Basic API routes configured');
}

/**
 * Configura e inicializa el servidor GraphQL
 *
 * @param {Object} repositories - Repositorios inicializados
 * @param {Object} services - Servicios inicializados
 * @returns {Promise<Object>} Servidor GraphQL
 */
async function setupGraphQLServer(repositories, services) {
    logger.info('Setting up GraphQL server');

    try {
        // Crear un router Express específico para GraphQL
        const graphqlRouter = express.Router();

        // Asegurar path correcto
        const graphqlPath = config.graphql.path || '/graphql';
        console.log(`[GRAPHQL] Configurando con path: '${graphqlPath}'`);

        // Configuración CORS
        const graphqlCorsOptions = getCorsOptions();

        // Aplicar CORS específico al router de GraphQL
        graphqlRouter.use(cors(graphqlCorsOptions));

        // Crear servidor GraphQL
        const graphqlServer = createGraphQLServer({
            repositories,
            services,
            logger: logger.createComponentLogger('GraphQL'),
            config: {
                port: config.server.port,
                graphql: config.graphql,
                apollo: config.apollo,
                cors: graphqlCorsOptions
            },
            expressApp: app
        });

        // Iniciar servidor GraphQL
        await graphqlServer.start();

        // Aplicar middleware solo al router específico de GraphQL, no a toda la app
        graphqlServer.server.applyMiddleware({
            app: graphqlRouter, // Usar el router específico en lugar de app
            path: '/', // Path relativo al router
            cors: graphqlCorsOptions
        });

        // Montar el router en la ruta específica de la app principal
        // Esto es clave: solo se aplica a esta ruta específica
        app.use(graphqlPath, graphqlRouter);

        logger.info(`GraphQL server ready at ${graphqlPath}`);

        return graphqlServer;

    } catch (error) {
        logger.error(`Failed to setup GraphQL server: ${error.message}`, error);
        throw error;
    }
}

/**
 * Inicializa las tareas programadas
 *
 * @param {Object} services - Servicios inicializados
 * @param {Object} repositories - Repositorios inicializados
 * @returns {Promise<void>}
 */
async function initializeSchedulers(services, repositories) {
    logger.info('Initializing scheduled tasks');

    try {
        // Inyectar dependencias
        schedulerManager.services = services;
        schedulerManager.repositories = repositories;

        // Inicializar tareas programadas
        await schedulerManager.initialize();

        initializedServices.push({ name: 'Scheduler Manager', instance: schedulerManager });

        logger.info('Scheduled tasks initialized successfully');

    } catch (error) {
        logger.error(`Failed to initialize schedulers: ${error.message}`, error);
        // No abortamos el inicio de la aplicación por un error en las tareas programadas
        logger.warn('Continuing application startup despite scheduler initialization failure');
    }
}

/**
 * Configura el manejo de señales para cierre graceful
 *
 * @param {http.Server} httpServer - Servidor HTTP
 */
function setupGracefulShutdown(httpServer) {
    // Manejar señales de terminación
    const signals = ['SIGTERM', 'SIGINT'];

    signals.forEach(signal => {
        process.on(signal, async () => {
            logger.info(`${signal} signal received. Starting graceful shutdown...`);

            // Detener el servidor HTTP
            httpServer.close(() => {
                logger.info('HTTP server closed');
            });

            // Detener servicios en orden inverso
            for (const service of [...initializedServices].reverse()) {
                logger.info(`Shutting down ${service.name}...`);

                try {
                    if (service.instance && typeof service.instance.stop === 'function') {
                        await service.instance.stop();
                    } else if (service.instance && typeof service.instance.close === 'function') {
                        await service.instance.close();
                    } else if (service.instance && typeof service.instance.shutdown === 'function') {
                        await service.instance.shutdown();
                    }

                    logger.info(`${service.name} shut down successfully`);
                } catch (error) {
                    logger.error(`Error shutting down ${service.name}: ${error.message}`, error);
                }
            }

            logger.info('Graceful shutdown completed');
            process.exit(0);
        });
    });

    // Manejar errores no capturados
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception', error);
        // No salimos inmediatamente para permitir logging y limpieza
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        // No salimos para permitir que la aplicación continúe
    });

    logger.debug('Graceful shutdown handlers configured');
}

// Iniciar la aplicación
bootstrap();
