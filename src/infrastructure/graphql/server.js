/**
 * @file server.js
 * @description Configuración y creación del servidor GraphQL
 *
 * Este archivo configura y crea el servidor Apollo GraphQL,
 * incluyendo middleware, contexto, plugins y otras opciones.
 */

const { ApolloServer } = require('apollo-server-express');
const { ApolloServerPluginDrainHttpServer } = require('apollo-server-core');
const {
    ApolloServerPluginLandingPageLocalDefault,
    ApolloServerPluginLandingPageProductionDefault
} = require('apollo-server-core');
const { ApolloServerPluginCacheControl } = require('apollo-server-core');
const { ApolloServerPluginUsageReporting } = require('apollo-server-core');
const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const depthLimit = require('graphql-depth-limit');
const { createComplexityLimitRule } = require('graphql-validation-complexity');

const { schema, configureMocks } = require('./schema');

/**
 * Crea y configura el servidor GraphQL
 *
 * @param {Object} options - Opciones de configuración
 * @param {Object} options.repositories - Repositorios inyectados
 * @param {Object} options.services - Servicios inyectados
 * @param {Object} options.dataSources - Data sources de Apollo
 * @param {Object} options.logger - Instancia del logger
 * @param {Object} options.config - Configuración general
 * @returns {Object} - Objeto con el servidor y métodos para iniciar/detener
 */
function createGraphQLServer({ repositories, services, dataSources = {}, logger, config, expressApp }) {
    // Crear la aplicación Express
    const app = expressApp || express();

    // Configurar middleware
    app.use(cors({
        origin: config.cors.origins || '*',
        methods: config.cors.methods || ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: config.cors.allowedHeaders || ['Content-Type', 'Authorization']
    }));

    app.use(compression());

    // Middleware para logging de solicitudes
    app.use((req, res, next) => {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            logger.debug(`HTTP ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
        });

        next();
    });

    // Crear el servidor HTTP
    const httpServer = http.createServer(app);

    // Configurar plugins para Apollo Server
    const plugins = [
        // Plugin para gestionar el cierre del servidor HTTP
        ApolloServerPluginDrainHttpServer({ httpServer }),

        // Plugin para control de caché
        ApolloServerPluginCacheControl({
            defaultMaxAge: 60, // 1 minuto
            calculateHttpHeaders: true
        }),

        // Plugin para página de inicio según entorno
        process.env.NODE_ENV === 'production'
            ? ApolloServerPluginLandingPageProductionDefault({
                graphRef: config.apollo.graphRef,
                footer: false
            })
            : ApolloServerPluginLandingPageLocalDefault({ footer: false })
    ];

    // Añadir reporting en producción si se configura
    if (process.env.NODE_ENV === 'production' && config.apollo.reportingEnabled) {
        plugins.push(
            ApolloServerPluginUsageReporting({
                sendVariableValues: { all: true },
                sendHeaders: { all: true },
                generateClientInfo: ({
                                         request
                                     }) => {
                    const headers = request.http && request.http.headers;
                    return {
                        clientName: headers && headers.get('apollographql-client-name'),
                        clientVersion: headers && headers.get('apollographql-client-version')
                    };
                }
            })
        );
    }

    // Crear servidor Apollo
    const server = new ApolloServer({
        schema: configureMocks(schema),
        dataSources: () => dataSources, // Esto es correcto - dejarlo así
        context: ({ req }) => {
            // Extraer token y verificar autenticación (simplificado)
            const token = req.headers.authorization || '';
            const isAdmin = token.includes('admin-token'); // Simplificado, usar autenticación real en producción

            return {
                repositories,
                services,
                isAdmin, // Mover esto directamente al contexto
                logger
            };
        },
        validationRules: [
            // Limitar profundidad de queries para prevenir ataques DoS
            depthLimit(config.graphql.maxDepth || 10),
            // Limitar complejidad de queries
            createComplexityLimitRule(config.graphql.maxComplexity || 1000)
        ],
        plugins,
        formatError: (error) => {
            // Logging de errores
            logger.error(`GraphQL Error: ${error.message}`, {
                error,
                path: error.path
            });

            // En desarrollo, devolver stack trace; en producción, solo mensaje
            if (process.env.NODE_ENV !== 'production') {
                return {
                    message: error.message,
                    path: error.path,
                    extensions: error.extensions,
                    locations: error.locations,
                    stack: error.originalError ? error.originalError.stack : error.stack
                };
            }

            // En producción, ocultar detalles internos
            return {
                message: error.message,
                path: error.path,
                extensions: {
                    code: error.extensions && error.extensions.code
                }
            };
        },
        // Configuración general
        introspection: config.graphql.introspection || process.env.NODE_ENV !== 'production',
        debug: config.graphql.debug || process.env.NODE_ENV !== 'production',
        cache: 'bounded'
    });

    // Método para iniciar el servidor
    const start = async (port = config.port || 4000) => {
        // Iniciar Apollo Server
        await server.start();

        // Aplicar middleware de Apollo a Express
        server.applyMiddleware({
            app,
            path: config.graphql.path || '/graphql',
            cors: false // Ya configurado en Express
        });

        // Iniciar servidor HTTP
        await new Promise(resolve => httpServer.listen({ port }, resolve));

        logger.info(`GraphQL server ready at http://localhost:${port}${server.graphqlPath}`);

        return {
            httpServer,
            apolloServer: server,
            app
        };
    };

    // Método para detener el servidor
    const stop = async () => {
        logger.info('Stopping GraphQL server...');

        await server.stop();
        await new Promise(resolve => httpServer.close(resolve));

        logger.info('GraphQL server stopped');
    };

    // Devolver objeto con el servidor y métodos
    return {
        server,
        httpServer,
        app,
        start,
        stop
    };
}

module.exports = createGraphQLServer;
