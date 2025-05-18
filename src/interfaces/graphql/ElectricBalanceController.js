/**
 * @file ElectricBalanceController.js
 * @description Controlador de GraphQL para el balance eléctrico
 *
 * Este archivo actúa como una capa intermedia entre los resolvers de GraphQL
 * y los casos de uso de la aplicación, facilitando la separación de responsabilidades
 * y permitiendo un mejor manejo de errores y transformaciones de datos.
 */

const GetElectricBalanceByDateRange = require('../../application/useCases/GetElectricBalanceByDateRange');
const FetchREEData = require('../../application/useCases/FetchREEData');
const { InvalidDateRangeError } = require('../../application/errors/ApplicationErrors');

/**
 * Clase que implementa el controlador de GraphQL para balance eléctrico
 */
class ElectricBalanceController {
    /**
     * Constructor del controlador
     *
     * @param {Object} repositories - Repositorios inyectados
     * @param {Object} services - Servicios inyectados
     * @param {Object} logger - Logger para registro de eventos
     */
    constructor(repositories, services, logger) {
        this.repositories = repositories;
        this.services = services;
        this.logger = logger;
    }

    /**
     * Obtiene un balance eléctrico por su ID
     *
     * @param {string} id - ID del balance eléctrico
     * @returns {Promise<Object>} - Balance eléctrico
     */
    async getElectricBalanceById(id) {
        this.logger.debug(`Getting electric balance with ID: ${id}`);

        const electricBalance = await this.repositories.electricBalanceRepository.findById(id);

        if (!electricBalance) {
            this.logger.warn(`Electric balance with ID ${id} not found`);
            return null;
        }

        return electricBalance;
    }

    /**
     * Obtiene balances eléctricos por rango de fechas
     *
     * @param {Object} params - Parámetros de búsqueda
     * @param {Date} params.startDate - Fecha de inicio
     * @param {Date} params.endDate - Fecha de fin
     * @param {string} params.timeScope - Alcance temporal (day, month, year)
     * @param {string} params.format - Formato de respuesta (default, raw, analysis, compact)
     * @param {Object} params.options - Opciones adicionales (paginación, filtros, etc.)
     * @returns {Promise<Object>} - Balances eléctricos
     */
    async getElectricBalanceByDateRange(params) {
        const { startDate, endDate, timeScope = 'day', format = 'default', options = {} } = params;

        this.logger.debug(`Getting electric balance by date range: ${startDate} - ${endDate} (${timeScope})`);

        // Validar parámetros
        this._validateDateRange(startDate, endDate);

        // Instanciar caso de uso
        const getElectricBalanceUseCase = new GetElectricBalanceByDateRange(
            this.repositories.electricBalanceRepository,
            this.services.electricBalanceService
        );

        // Ejecutar caso de uso
        const result = await getElectricBalanceUseCase.execute({
            startDate,
            endDate,
            timeScope,
            format,
            options
        });

        return result;
    }

    /**
     * Obtiene balances eléctricos paginados
     *
     * @param {Object} params - Parámetros de búsqueda
     * @param {Date} params.startDate - Fecha de inicio
     * @param {Date} params.endDate - Fecha de fin
     * @param {string} params.timeScope - Alcance temporal
     * @param {Object} params.pagination - Opciones de paginación
     * @param {Object} params.filters - Filtros adicionales
     * @returns {Promise<Object>} - Resultado paginado
     */
    async getElectricBalancePaginated(params) {
        const {
            startDate,
            endDate,
            timeScope = 'day',
            pagination = { page: 1, pageSize: 20 },
            filters = {}
        } = params;

        this.logger.debug(`Getting paginated electric balance: page ${pagination.page}, size ${pagination.pageSize}`);

        // Validar parámetros
        this._validateDateRange(startDate, endDate);

        // Preparar opciones
        const options = {
            page: pagination.page,
            limit: pagination.pageSize,
            sort: {}
        };

        // Configurar ordenación
        if (pagination.orderBy) {
            options.sort[pagination.orderBy] = pagination.orderDirection === 'DESC' ? -1 : 1;
        } else {
            options.sort.timestamp = 1; // Ordenación por defecto
        }

        // Preparar filtros
        const dbFilters = this._transformFilters(filters);

        // Obtener datos y conteo total en paralelo
        const [
            data,
            totalCount
        ] = await Promise.all([
            this.repositories.electricBalanceRepository.findByDateRange(
                startDate,
                endDate,
                timeScope,
                { ...options, filters: dbFilters }
            ),
            this.repositories.electricBalanceRepository.findByDateRange(
                startDate,
                endDate,
                timeScope,
                { onlyCount: true, filters: dbFilters }
            )
        ]);

        // Calcular paginación
        const totalPages = Math.ceil(totalCount.count / pagination.pageSize);

        return {
            items: data,
            totalCount: totalCount.count,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalPages,
            hasPreviousPage: pagination.page > 1,
            hasNextPage: pagination.page < totalPages
        };
    }

    /**
     * Obtiene estadísticas de balance eléctrico
     *
     * @param {Object} params - Parámetros de búsqueda
     * @param {Date} params.startDate - Fecha de inicio
     * @param {Date} params.endDate - Fecha de fin
     * @param {string} params.timeScope - Alcance temporal
     * @returns {Promise<Object>} - Estadísticas
     */
    async getElectricBalanceStats(params) {
        const { startDate, endDate, timeScope = 'day' } = params;

        this.logger.debug(`Getting electric balance stats: ${startDate} - ${endDate} (${timeScope})`);

        // Validar parámetros
        this._validateDateRange(startDate, endDate);

        // Obtener estadísticas
        const stats = await this.repositories.electricBalanceRepository.getStatsByDateRange(
            startDate,
            endDate,
            timeScope
        );

        return stats;
    }

    /**
     * Obtiene análisis de balance eléctrico
     *
     * @param {Object} params - Parámetros de búsqueda
     * @param {Date} params.startDate - Fecha de inicio
     * @param {Date} params.endDate - Fecha de fin
     * @param {string} params.timeScope - Alcance temporal
     * @param {Object} params.options - Opciones de análisis
     * @returns {Promise<Object>} - Análisis
     */
    async getElectricBalanceAnalysis(params) {
        const {
            startDate,
            endDate,
            timeScope = 'day',
            options = {}
        } = params;

        this.logger.debug(`Getting electric balance analysis: ${startDate} - ${endDate} (${timeScope})`);

        // Validar parámetros
        this._validateDateRange(startDate, endDate);

        // Obtener análisis mediante el servicio de dominio
        const analysis = await this.services.electricBalanceService.analyzeBalanceDataByDateRange(
            startDate,
            endDate,
            timeScope
        );

        // Añadir datos adicionales según opciones
        if (options.includePatterns) {
            const patterns = await this.services.electricBalanceService.detectPatternsAndAnomalies(
                startDate,
                endDate,
                timeScope
            );

            analysis.patterns = patterns.patterns;
            analysis.anomalies = patterns.anomalies;
        }

        if (options.includeSustainability) {
            const sustainability = await this.services.electricBalanceService.calculateSustainabilityMetrics(
                startDate,
                endDate,
                timeScope
            );

            analysis.sustainability = sustainability.metrics;
        }

        return analysis;
    }

    /**
     * Compara dos períodos de balance eléctrico
     *
     * @param {Object} params - Parámetros de comparación
     * @param {Date} params.currentStartDate - Inicio del período actual
     * @param {Date} params.currentEndDate - Fin del período actual
     * @param {Date} params.previousStartDate - Inicio del período anterior
     * @param {Date} params.previousEndDate - Fin del período anterior
     * @param {string} params.timeScope - Alcance temporal
     * @returns {Promise<Object>} - Comparación
     */
    async compareElectricBalancePeriods(params) {
        const {
            currentStartDate,
            currentEndDate,
            previousStartDate,
            previousEndDate,
            timeScope = 'day'
        } = params;

        this.logger.debug('Comparing electric balance periods');

        // Validar parámetros
        this._validateDateRange(currentStartDate, currentEndDate);
        this._validateDateRange(previousStartDate, previousEndDate);

        // Realizar comparación
        const comparison = await this.services.electricBalanceService.comparePeriods(
            currentStartDate,
            currentEndDate,
            previousStartDate,
            previousEndDate,
            timeScope
        );

        return comparison;
    }

    /**
     * Obtiene el balance eléctrico más reciente
     *
     * @returns {Promise<Object>} - Balance eléctrico más reciente
     */
    async getLatestElectricBalance() {
        this.logger.debug('Getting latest electric balance');

        const latestBalance = await this.repositories.electricBalanceRepository.findMostRecent();

        return latestBalance;
    }

    /**
     * Refresca los datos de balance eléctrico desde la API de REE
     *
     * @param {Object} params - Parámetros para refrescar datos
     * @param {Date} params.startDate - Fecha de inicio
     * @param {Date} params.endDate - Fecha de fin
     * @param {string} params.timeScope - Alcance temporal
     * @param {boolean} params.forceUpdate - Forzar actualización
     * @returns {Promise<Object>} - Resultado de la operación
     */
    async refreshElectricBalanceData(params) {
        const { startDate, endDate, timeScope = 'day', forceUpdate = false } = params;

        this.logger.debug(`Refreshing electric balance data: ${startDate} - ${endDate} (${timeScope})`);

        // Validar parámetros
        this._validateDateRange(startDate, endDate);

        // Instanciar caso de uso
        const fetchREEDataUseCase = new FetchREEData(
            this.services.reeApiService,
            this.repositories.electricBalanceRepository,
            this.logger
        );

        // Ejecutar caso de uso
        const result = await fetchREEDataUseCase.execute({
            startDate,
            endDate,
            timeScope,
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
    }

    /**
     * Obtiene la distribución de generación por tipo
     *
     * @param {Object} params - Parámetros de búsqueda
     * @param {Date} params.startDate - Fecha de inicio
     * @param {Date} params.endDate - Fecha de fin
     * @param {string} params.timeScope - Alcance temporal
     * @returns {Promise<Array>} - Distribución de generación
     */
    async getGenerationDistribution(params) {
        const { startDate, endDate, timeScope = 'day' } = params;

        this.logger.debug(`Getting generation distribution: ${startDate} - ${endDate} (${timeScope})`);

        // Validar parámetros
        this._validateDateRange(startDate, endDate);

        // Obtener distribución
        const distribution = await this.repositories.electricBalanceRepository.getGenerationDistribution(
            startDate,
            endDate,
            timeScope
        );

        return distribution;
    }

    /**
     * Obtiene series temporales para un indicador específico
     *
     * @param {Object} params - Parámetros de búsqueda
     * @param {Date} params.startDate - Fecha de inicio
     * @param {Date} params.endDate - Fecha de fin
     * @param {string} params.timeScope - Alcance temporal
     * @param {string} params.indicator - Indicador a obtener
     * @returns {Promise<Array>} - Serie temporal
     */
    async getTimeSeriesForIndicator(params) {
        const { startDate, endDate, timeScope = 'day', indicator } = params;

        this.logger.debug(`Getting time series for indicator ${indicator}: ${startDate} - ${endDate} (${timeScope})`);

        // Validar parámetros
        this._validateDateRange(startDate, endDate);

        // Validar indicador
        const allowedIndicators = [
            'totalGeneration', 'totalDemand', 'balance', 'renewablePercentage'
        ];

        if (!allowedIndicators.includes(indicator)) {
            throw new Error(
                `Invalid indicator: ${indicator}. Allowed values: ${allowedIndicators.join(', ')}`
            );
        }

        // Obtener serie temporal
        const timeSeries = await this.repositories.electricBalanceRepository.getTimeSeriesForIndicator(
            indicator,
            startDate,
            endDate,
            timeScope
        );

        return timeSeries;
    }

    /**
     * Transforma filtros de GraphQL a filtros de MongoDB
     *
     * @param {Object} filters - Filtros de GraphQL
     * @returns {Object} - Filtros para MongoDB
     * @private
     */
    _transformFilters(filters) {
        const dbFilters = {};

        if (filters.minRenewablePercentage) {
            dbFilters.renewablePercentage = { $gte: filters.minRenewablePercentage };
        }

        if (filters.generationType) {
            dbFilters['generation.type'] = filters.generationType;
        }

        if (filters.minTotalGeneration) {
            dbFilters.totalGeneration = {
                ...(dbFilters.totalGeneration || {}),
                $gte: filters.minTotalGeneration
            };
        }

        if (filters.maxTotalGeneration) {
            dbFilters.totalGeneration = {
                ...(dbFilters.totalGeneration || {}),
                $lte: filters.maxTotalGeneration
            };
        }

        if (filters.minTotalDemand) {
            dbFilters.totalDemand = {
                ...(dbFilters.totalDemand || {}),
                $gte: filters.minTotalDemand
            };
        }

        if (filters.maxTotalDemand) {
            dbFilters.totalDemand = {
                ...(dbFilters.totalDemand || {}),
                $lte: filters.maxTotalDemand
            };
        }

        return dbFilters;
    }

    /**
     * Valida un rango de fechas
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @throws {InvalidDateRangeError} - Si el rango es inválido
     * @private
     */
    _validateDateRange(startDate, endDate) {
        // Verificar que son fechas válidas
        const start = startDate instanceof Date ? startDate : new Date(startDate);
        const end = endDate instanceof Date ? endDate : new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new InvalidDateRangeError('Invalid date format');
        }

        // Verificar que la fecha de inicio es anterior a la de fin
        if (start > end) {
            throw new InvalidDateRangeError('Start date must be before end date');
        }

        // Verificar que el rango no es excesivamente grande
        const diffInDays = (end - start) / (1000 * 60 * 60 * 24);

        if (diffInDays > 366) {
            throw new InvalidDateRangeError('Date range cannot exceed 366 days');
        }
    }
}

module.exports = ElectricBalanceController;
