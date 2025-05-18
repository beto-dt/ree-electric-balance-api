
/**
 * @file electricBalanceResolvers.js
 * @description Resolvers de GraphQL para el balance eléctrico
 *
 * Este archivo implementa los resolvers para las queries y mutaciones
 * relacionadas con el balance eléctrico, conectando el esquema GraphQL
 * con los casos de uso de la aplicación.
 */

const { GraphQLScalarType } = require('graphql');
const { Kind } = require('graphql/language');
const { UserInputError, ApolloError } = require('apollo-server-express');

const GetElectricBalanceByDateRange = require('../../../application/use-cases/GetElectricBalanceByDateRange');
const FetchREEData = require('../../../application/use-cases/FetchREEData');

const {
    InvalidDateRangeError,
    ApiRequestError,
    ApiResponseError,
    RepositoryError,
    NotFoundError
} = require('../../../application/errors/ApplicationErrors');

/**
 * Mapeo de errores de aplicación a errores de Apollo GraphQL
 *
 * @param {Error} error - Error original
 * @returns {Error} - Error apropiado para GraphQL
 */
const mapErrorToGraphQLError = (error) => {
    if (error instanceof InvalidDateRangeError) {
        return new UserInputError(error.message, {
            validationErrors: error.validationErrors
        });
    }

    if (error instanceof ApiRequestError || error instanceof ApiResponseError) {
        return new ApolloError(
            error.message,
            'EXTERNAL_API_ERROR',
            { originalError: error.toJSON() }
        );
    }

    if (error instanceof RepositoryError) {
        return new ApolloError(
            error.message,
            'DATABASE_ERROR',
            { originalError: error.toJSON() }
        );
    }

    if (error instanceof NotFoundError) {
        return new ApolloError(
            error.message,
            'NOT_FOUND',
            { originalError: error.toJSON() }
        );
    }

    return new ApolloError(
        error.message,
        'INTERNAL_SERVER_ERROR',
        { stack: error.stack }
    );
};

const DateTimeScalar = new GraphQLScalarType({
    name: 'DateTime',
    description: 'Fecha y hora en formato ISO 8601',
    serialize(value) {
        return value instanceof Date ? value.toISOString() : value;
    },
    parseValue(value) {
        return new Date(value);
    },
    parseLiteral(ast) {
        if (ast.kind === Kind.STRING) {
            return new Date(ast.value);
        }
        return null;
    },
});

const JSONObjectScalar = new GraphQLScalarType({
    name: 'JSONObject',
    description: 'Objeto JSON arbitrario',
    serialize(value) {
        return value;
    },
    parseValue(value) {
        return value;
    },
    parseLiteral(ast) {
        switch (ast.kind) {
            case Kind.STRING:
                return JSON.parse(ast.value);
            case Kind.OBJECT:
                return ast.fields.reduce((obj, field) => {
                    obj[field.name.value] = parseLiteral(field.value);
                    return obj;
                }, {});
            default:
                return null;
        }
    },
});

/**
 * Resolvers para el balance eléctrico
 */
const electricBalanceResolvers = {
    DateTime: DateTimeScalar,
    JSONObject: JSONObjectScalar,
    ElectricBalance: {
        totalGeneration: (parent) => {
            // Si ya tiene un valor válido, usarlo
            if (parent.totalGeneration !== null && parent.totalGeneration !== undefined && parent.totalGeneration > 0) {
                return parent.totalGeneration;
            }

            // Si hay datos de generación, calcular la suma
            if (parent.generation && Array.isArray(parent.generation) && parent.generation.length > 0) {
                const total = parent.generation.reduce((sum, item) => {
                    const value = parseFloat(item.value);
                    return sum + (Number.isFinite(value) ? value : 0);
                }, 0);
                return total;
            }

            // Si no hay datos, devolver 0
            return 0;
        },
        totalDemand: (parent) => {
            // Si ya tiene un valor válido, usarlo
            if (parent.totalDemand !== null && parent.totalDemand !== undefined && parent.totalDemand > 0) {
                return parent.totalDemand;
            }

            // Si hay datos de demanda, calcular la suma
            if (parent.demand && Array.isArray(parent.demand) && parent.demand.length > 0) {
                const total = parent.demand.reduce((sum, item) => {
                    const value = parseFloat(item.value);
                    return sum + (Number.isFinite(value) ? value : 0);
                }, 0);
                return total;
            }

            // Si no hay datos, devolver 0
            return 0;
        },
        balance: (parent) => {
            // Si ya tiene un valor válido, usarlo
            if (parent.balance !== null && parent.balance !== undefined) {
                return parent.balance;
            }

            // Obtener generación y demanda
            let totalGeneration;
            let totalDemand;

            // Calcular totalGeneration si es necesario
            if (parent.totalGeneration !== null && parent.totalGeneration !== undefined && parent.totalGeneration > 0) {
                totalGeneration = parent.totalGeneration;
            } else if (parent.generation && Array.isArray(parent.generation) && parent.generation.length > 0) {
                totalGeneration = parent.generation.reduce((sum, item) => {
                    const value = parseFloat(item.value);
                    return sum + (Number.isFinite(value) ? value : 0);
                }, 0);
            } else {
                totalGeneration = 0;
            }

            // Calcular totalDemand si es necesario
            if (parent.totalDemand !== null && parent.totalDemand !== undefined && parent.totalDemand > 0) {
                totalDemand = parent.totalDemand;
            } else if (parent.demand && Array.isArray(parent.demand) && parent.demand.length > 0) {
                totalDemand = parent.demand.reduce((sum, item) => {
                    const value = parseFloat(item.value);
                    return sum + (Number.isFinite(value) ? value : 0);
                }, 0);
            } else {
                totalDemand = 0;
            }

            // Calcular y devolver balance
            return totalGeneration - totalDemand;
        },
        renewablePercentage: (parent) => {
            // Si ya tiene un valor válido, usarlo
            if (parent.renewablePercentage !== null && parent.renewablePercentage !== undefined && parent.renewablePercentage > 0) {
                return parent.renewablePercentage;
            }

            // Si hay datos de generación, calcular el porcentaje renovable
            if (parent.generation && Array.isArray(parent.generation) && parent.generation.length > 0) {
                const renewableTypes = [
                    'Hidráulica', 'Eólica', 'Solar fotovoltaica', 'Solar térmica',
                    'Otras renovables', 'Hidroeólica', 'Residuos renovables', 'Generación renovable'
                ];

                // Calcular total de generación
                const totalGen = parent.generation.reduce((sum, item) => {
                    const value = parseFloat(item.value);
                    return sum + (Number.isFinite(value) ? value : 0);
                }, 0);

                // Calcular generación renovable
                const renewableGen = parent.generation
                  .filter(item => renewableTypes.includes(item.type))
                  .reduce((sum, item) => {
                      const value = parseFloat(item.value);
                      return sum + (Number.isFinite(value) ? value : 0);
                  }, 0);

                // Calcular porcentaje renovable
                return totalGen > 0 ? (renewableGen / totalGen) * 100 : 0;
            }

            // Si no hay datos, devolver 0
            return 0;
        }
    },

    // Queries
    Query: {
        /**
         * Obtiene un balance eléctrico por su ID
         */
        electricBalance: async (_, { id }, { dataSources, repositories, logger }) => {
            try {
                const electricBalance = await repositories.electricBalanceRepository.findById(id);

                if (!electricBalance) {
                    throw new NotFoundError(
                        `Electric balance with ID ${id} not found`,
                        { resourceType: 'ElectricBalance', resourceId: id }
                    );
                }

                return electricBalance;
            } catch (error) {
                logger.error(`Error fetching electric balance by ID: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        },

        /**
         * Obtiene balances eléctricos por rango de fechas con paginación y filtros
         */
        electricBalanceByDateRange: async (_, { dateRange, pagination = {}, filters = {} }, { dataSources, repositories, services, logger }) => {
            try {
                // Instanciar el caso de uso
                const getElectricBalanceUseCase = new GetElectricBalanceByDateRange(
                    repositories.electricBalanceRepository,
                    services.electricBalanceService
                );

                // Convertir entrada GraphQL a parámetros del caso de uso
                const paginationOptions = {
                    page: pagination.page || 1,
                    limit: pagination.pageSize || 20,
                    sort: {}
                };

                // Configurar ordenación
                if (pagination.orderBy) {
                    paginationOptions.sort[pagination.orderBy] =
                        pagination.orderDirection === 'DESC' ? -1 : 1;
                }

                // Preparar filtros adicionales
                const additionalFilters = {};

                if (filters.minRenewablePercentage) {
                    additionalFilters.renewablePercentage = { $gte: filters.minRenewablePercentage };
                }

                if (filters.generationType) {
                    additionalFilters['generation.type'] = filters.generationType;
                }

                if (filters.minTotalGeneration) {
                    additionalFilters.totalGeneration = {
                        ...(additionalFilters.totalGeneration || {}),
                        $gte: filters.minTotalGeneration
                    };
                }

                if (filters.maxTotalGeneration) {
                    additionalFilters.totalGeneration = {
                        ...(additionalFilters.totalGeneration || {}),
                        $lte: filters.maxTotalGeneration
                    };
                }

                if (filters.minTotalDemand) {
                    additionalFilters.totalDemand = {
                        ...(additionalFilters.totalDemand || {}),
                        $gte: filters.minTotalDemand
                    };
                }

                if (filters.maxTotalDemand) {
                    additionalFilters.totalDemand = {
                        ...(additionalFilters.totalDemand || {}),
                        $lte: filters.maxTotalDemand
                    };
                }

                // Ejecutar caso de uso
                const options = {
                    ...paginationOptions,
                    filters: additionalFilters
                };

                const result = await getElectricBalanceUseCase.execute({
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                    timeScope: dateRange.timeScope || 'day',
                    format: 'default',
                    options
                });

                // Obtener cuenta total para paginación
                const totalCount = await repositories.electricBalanceRepository.findByDateRange(
                    dateRange.startDate,
                    dateRange.endDate,
                    dateRange.timeScope || 'day',
                    { onlyCount: true }
                );

                // Preparar respuesta paginada
                return {
                    items: result.data,
                    totalCount: totalCount.count,
                    page: paginationOptions.page,
                    pageSize: paginationOptions.limit,
                    hasPreviousPage: paginationOptions.page > 1,
                    hasNextPage: paginationOptions.page * paginationOptions.limit < totalCount.count
                };
            } catch (error) {
                logger.error(`Error fetching electric balance by date range: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        },

        /**
         * Obtiene estadísticas de balance eléctrico por rango de fechas
         */
        electricBalanceStats: async (_, { dateRange }, { repositories, logger }) => {
            try {
                const stats = await repositories.electricBalanceRepository.getStatsByDateRange(
                    dateRange.startDate,
                    dateRange.endDate,
                    dateRange.timeScope || 'day'
                );

                if (!stats || !stats.stats) {
                    throw new Error('No statistics available for the specified date range');
                }

                return {
                    generation: stats.stats.generation,
                    demand: stats.stats.demand,
                    renewablePercentage: stats.stats.renewablePercentage,
                    count: stats.count,
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                    timeScope: dateRange.timeScope || 'day'
                };
            } catch (error) {
                logger.error(`Error fetching electric balance stats: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        },

        /**
         * Obtiene distribución de generación por tipo para un rango de fechas
         */
        generationDistribution: async (_, { dateRange }, { repositories, logger }) => {
            try {
                const distribution = await repositories.electricBalanceRepository.getGenerationDistribution(
                    dateRange.startDate,
                    dateRange.endDate,
                    dateRange.timeScope || 'day'
                );

                return distribution;
            } catch (error) {
                logger.error(`Error fetching generation distribution: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        },

        /**
         * Obtiene series temporales para un indicador específico
         */
        electricBalanceTimeSeries: async (_, { dateRange, indicator }, { repositories, logger }) => {
            try {
                // Validar indicador permitido
                const allowedIndicators = [
                    'totalGeneration', 'totalDemand', 'balance', 'renewablePercentage'
                ];

                if (!allowedIndicators.includes(indicator)) {
                    throw new UserInputError(
                        `Invalid indicator: ${indicator}. Allowed values: ${allowedIndicators.join(', ')}`
                    );
                }

                const timeSeries = await repositories.electricBalanceRepository.getTimeSeriesForIndicator(
                    indicator,
                    dateRange.startDate,
                    dateRange.endDate,
                    dateRange.timeScope || 'day'
                );

                return timeSeries;
            } catch (error) {
                logger.error(`Error fetching time series: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        },

        /**
         * Obtiene análisis completo de balance eléctrico para un rango de fechas
         */
        electricBalanceAnalysis: async (_, { dateRange, options = {} }, { repositories, services, logger }) => {
            try {
                // Obtener estadísticas
                const stats = await repositories.electricBalanceRepository.getStatsByDateRange(
                    dateRange.startDate,
                    dateRange.endDate,
                    dateRange.timeScope || 'day'
                );

                // Obtener distribución de generación
                const generationDistribution = await repositories.electricBalanceRepository.getGenerationDistribution(
                    dateRange.startDate,
                    dateRange.endDate,
                    dateRange.timeScope || 'day'
                );

                // Obtener series temporales para indicadores clave
                const [generationSeries, demandSeries, renewableSeries, balanceSeries] = await Promise.all([
                    repositories.electricBalanceRepository.getTimeSeriesForIndicator(
                        'totalGeneration', dateRange.startDate, dateRange.endDate, dateRange.timeScope || 'day'
                    ),
                    repositories.electricBalanceRepository.getTimeSeriesForIndicator(
                        'totalDemand', dateRange.startDate, dateRange.endDate, dateRange.timeScope || 'day'
                    ),
                    repositories.electricBalanceRepository.getTimeSeriesForIndicator(
                        'renewablePercentage', dateRange.startDate, dateRange.endDate, dateRange.timeScope || 'day'
                    ),
                    repositories.electricBalanceRepository.getTimeSeriesForIndicator(
                        'balance', dateRange.startDate, dateRange.endDate, dateRange.timeScope || 'day'
                    )
                ]);

                // Obtener datos adicionales opcionales
                let trends = null;
                let sustainability = null;

                if (options.includePatterns) {
                    trends = await services.electricBalanceService.detectPatternsAndAnomalies(
                        dateRange.startDate,
                        dateRange.endDate,
                        dateRange.timeScope || 'day'
                    );
                }

                if (options.includeSustainability) {
                    sustainability = await services.electricBalanceService.calculateSustainabilityMetrics(
                        dateRange.startDate,
                        dateRange.endDate,
                        dateRange.timeScope || 'day'
                    );
                }

                // Construir respuesta completa
                return {
                    stats: {
                        generation: stats.stats.generation,
                        demand: stats.stats.demand,
                        renewablePercentage: stats.stats.renewablePercentage,
                        count: stats.count,
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                        timeScope: dateRange.timeScope || 'day'
                    },
                    generationDistribution,
                    generationSeries,
                    demandSeries,
                    renewableSeries,
                    balanceSeries,
                    trends: trends ? trends.patterns : null,
                    period: {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                        timeScope: dateRange.timeScope || 'day',
                        recordCount: stats.count
                    },
                    ...(sustainability ? { sustainability: sustainability.metrics } : {})
                };
            } catch (error) {
                logger.error(`Error generating electric balance analysis: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        },

        /**
         * Compara dos períodos de balance eléctrico
         */
        compareElectricBalancePeriods: async (_, { periods }, { services, logger }) => {
            try {
                const comparisonResult = await services.electricBalanceService.comparePeriods(
                    periods.currentStartDate,
                    periods.currentEndDate,
                    periods.previousStartDate,
                    periods.previousEndDate,
                    periods.timeScope || 'day'
                );

                return comparisonResult;
            } catch (error) {
                logger.error(`Error comparing electric balance periods: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        },

        /**
         * Obtiene el balance eléctrico más reciente
         */
        latestElectricBalance: async (_, __, { repositories, logger }) => {
            try {
                const latestBalance = await repositories.electricBalanceRepository.findMostRecent();

                if (!latestBalance) {
                    return null;
                }

                if (latestBalance.getTotalGeneration() === null ||
                  latestBalance.getTotalGeneration() === undefined) {
                    latestBalance.totalGeneration = 0;
                }

                return latestBalance;
            } catch (error) {
                logger.error(`Error fetching latest electric balance: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        }
    },

    // Mutaciones
    Mutation: {
        /**
         * Refresca los datos de balance eléctrico para un rango de fechas
         */
        refreshElectricBalanceData: async (_, { dateRange, forceUpdate }, { dataSources, services, repositories, logger }) => {
            try {
                // Verificar permisos (simplificado - en producción se implementaría autenticación)

                // Crear instancia del caso de uso
                const fetchREEDataUseCase = new FetchREEData(
                    services.reeApiService,
                    repositories.electricBalanceRepository,
                    logger
                );

                // Ejecutar caso de uso
                const result = await fetchREEDataUseCase.execute({
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                    timeScope: dateRange.timeScope || 'day',
                    forceUpdate
                });

                return {
                    success: true,
                    message: result.message,
                    savedCount: result.savedCount,
                    timeScope: result.timeScope,
                    startDate: result.startDate,
                    endDate: result.endDate,
                    status: result.status
                };
            } catch (error) {
                logger.error(`Error refreshing electric balance data: ${error.message}`, error);
                throw mapErrorToGraphQLError(error);
            }
        }
    }
};

module.exports = electricBalanceResolvers;
