/**
 * @file schema.js
 * @description Definición del esquema GraphQL principal
 *
 * Este archivo combina todos los tipos y resolvers de GraphQL para crear
 * el esquema completo que será utilizado por el servidor.
 */

const { gql } = require('apollo-server-express');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { merge } = require('lodash');

// Importar esquemas específicos
const electricBalanceSchema = require('./schema/electricBalance');

// Importar resolvers específicos
const electricBalanceResolvers = require('./resolvers/electricBalanceResolvers');

// Definir tipos base y directives
const baseTypeDefs = gql`
    """
    Directiva para marcar un campo como deprecado
    """
    directive @deprecated(
        reason: String = "No longer supported"
    ) on FIELD_DEFINITION | ENUM_VALUE

    """
    Directiva para especificar niveles de acceso requeridos
    """
    directive @requiresAuth(
        role: String = "USER"
    ) on FIELD_DEFINITION

    """
    Scalar para fechas ISO 8601
    """
    scalar DateTime

    """
    Scalar para objetos JSON
    """
    scalar JSONObject

    """
    Tipo para información sobre la API
    """
    type ApiInfo {
        """Nombre de la API"""
        name: String!
        """Versión de la API"""
        version: String!
        """Descripción de la API"""
        description: String!
        """URL base de la API"""
        baseUrl: String!
        """Fecha de actualización"""
        lastUpdated: DateTime!
    }

    """
    Tipo para información sobre el estado del servidor
    """
    type ServerStatus {
        """Estado del servidor"""
        status: String!
        """Tiempo de actividad en segundos"""
        uptime: Float!
        """Estado de la conexión a la base de datos"""
        dbStatus: String!
        """Estado de la API de REE"""
        reeApiStatus: String!
        """Fecha y hora actual del servidor"""
        serverTime: DateTime!
        """Información sobre la versión"""
        version: String!
    }

    """
    Tipo Query base
    """
    type Query {
        """Obtiene información sobre la API"""
        apiInfo: ApiInfo!

        """Obtiene el estado actual del servidor"""
        serverStatus: ServerStatus!
    }

    """
    Tipo Mutation base
    """
    type Mutation {
        """Ping para verificar que la API está funcionando"""
        ping: String!
    }
`;

// Definir resolvers base
const baseResolvers = {
    Query: {
        // Resolver para obtener información de la API
        apiInfo: () => ({
            name: 'REE Balance Eléctrico API',
            version: '1.0.0',
            description: 'API para acceder a datos de balance eléctrico de Red Eléctrica de España',
            baseUrl: '/graphql',
            lastUpdated: new Date()
        }),

        // Resolver para obtener el estado del servidor
        serverStatus: async (_, __, { dataSources, services }) => {
            // Verificar estado de la API de REE
            const reeApiStatus = await services.reeApiService.checkApiStatus();

            // Verificar estado de la base de datos
            const dbStatus = await services.mongoConnection.healthCheck();

            return {
                status: 'operational',
                uptime: process.uptime(),
                dbStatus: dbStatus.status,
                reeApiStatus: reeApiStatus.status,
                serverTime: new Date(),
                version: process.env.APP_VERSION || '1.0.0'
            };
        }
    },

    Mutation: {
        // Resolver simple para verificar que las mutaciones funcionan
        ping: () => 'pong'
    }
};

// Combinar todos los esquemas
const typeDefs = [
    baseTypeDefs,
    electricBalanceSchema
    // Añadir aquí más esquemas a medida que se creen
];

// Combinar todos los resolvers
const resolvers = merge(
    baseResolvers,
    electricBalanceResolvers
    // Añadir aquí más resolvers a medida que se creen
);

// Crear y exportar el esquema ejecutable
const schema = makeExecutableSchema({
    typeDefs,
    resolvers
});

// Configuración para los mocks en desarrollo
const configureMocks = (schema, preserveResolvers = true) => {
    if (process.env.NODE_ENV === 'development' && process.env.ENABLE_GRAPHQL_MOCKS === 'true') {
        const { addMocksToSchema } = require('@graphql-tools/mock');
        const mocks = {
            DateTime: () => new Date().toISOString(),
            JSONObject: () => ({ mockData: true }),
            ElectricBalance: () => ({
                id: () => `mock-balance-${Math.floor(Math.random() * 1000)}`,
                timestamp: () => new Date(),
                totalGeneration: () => Math.random() * 40000 + 20000,
                totalDemand: () => Math.random() * 35000 + 20000,
                renewablePercentage: () => Math.random() * 100
            })
        };

        return addMocksToSchema({
            schema,
            mocks,
            preserveResolvers
        });
    }

    return schema;
};

module.exports = {
    schema,
    configureMocks
};
