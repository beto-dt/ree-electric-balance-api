/**
 * @file GetElectricBalanceByDateRange.js
 * @description Caso de uso para obtener datos de balance eléctrico por rango de fechas
 *
 * Este caso de uso implementa la lógica para obtener y procesar datos de balance eléctrico
 * para un rango de fechas específico, incluyendo validaciones y manejo de diferentes
 * formatos de respuesta.
 */

const { InvalidDateRangeError, RepositoryError } = require('../errors/ApplicationErrors');

/**
 * Clase que implementa el caso de uso para obtener balance eléctrico por rango de fechas
 */
class GetElectricBalanceByDateRange {
    /**
     * Constructor del caso de uso
     *
     * @param {import('../../domain/repositories/ElectricBalanceRepository')} electricBalanceRepository - Repositorio de balance eléctrico
     * @param {import('../../domain/services/ElectricBalanceService')} electricBalanceService - Servicio de balance eléctrico
     */
    constructor(electricBalanceRepository, electricBalanceService) {
        this.electricBalanceRepository = electricBalanceRepository;
        this.electricBalanceService = electricBalanceService;
    }

    /**
     * Ejecuta el caso de uso
     *
     * @param {Object} params - Parámetros del caso de uso
     * @param {string|Date} params.startDate - Fecha de inicio
     * @param {string|Date} params.endDate - Fecha de fin
     * @param {string} [params.timeScope='day'] - Granularidad temporal (day, month, year)
     * @param {string} [params.format='default'] - Formato de respuesta (default, raw, analysis, compact)
     * @param {Object} [params.options={}] - Opciones adicionales (paginación, filtros, etc.)
     * @returns {Promise<Object>} - Datos de balance eléctrico
     * @throws {InvalidDateRangeError} - Si el rango de fechas es inválido
     * @throws {RepositoryError} - Si hay problemas con el repositorio
     */
    async execute({ startDate, endDate, timeScope = 'day', format = 'default', options = {} }) {
        // Validar y parsear fechas
        const parsedStartDate = this._parseDate(startDate);
        const parsedEndDate = this._parseDate(endDate);

        // Validar rango de fechas
        this._validateDateRange(parsedStartDate, parsedEndDate);

        // Validar timeScope
        this._validateTimeScope(timeScope);

        try {
            // Según el formato solicitado, devolvemos diferentes respuestas
            switch (format.toLowerCase()) {
                case 'raw':
                    // Datos crudos sin procesamiento adicional
                    return await this._getRawData(parsedStartDate, parsedEndDate, timeScope, options);

                case 'analysis':
                    // Análisis completo usando el servicio de dominio
                    return await this._getAnalysisData(parsedStartDate, parsedEndDate, timeScope, options);

                case 'compact':
                    // Versión simplificada con solo los datos esenciales
                    return await this._getCompactData(parsedStartDate, parsedEndDate, timeScope, options);

                case 'default':
                default:
                    // Formato predeterminado con balance de detalles
                    return await this._getDefaultData(parsedStartDate, parsedEndDate, timeScope, options);
            }
        } catch (error) {
            if (error instanceof InvalidDateRangeError) {
                throw error;
            }

            throw new RepositoryError(
                `Error obtaining electric balance data: ${error.message}`,
                { originalError: error }
            );
        }
    }

    /**
     * Parsea y valida una fecha
     *
     * @param {string|Date} date - Fecha a parsear
     * @returns {Date} - Fecha parseada
     * @throws {InvalidDateRangeError} - Si la fecha es inválida
     * @private
     */
    _parseDate(date) {
        if (date instanceof Date) {
            if (isNaN(date.getTime())) {
                throw new InvalidDateRangeError('Invalid date object provided');
            }
            return date;
        }

        if (typeof date === 'string') {
            const parsedDate = new Date(date);
            if (isNaN(parsedDate.getTime())) {
                throw new InvalidDateRangeError(`Invalid date string: ${date}`);
            }
            return parsedDate;
        }

        throw new InvalidDateRangeError('Date must be a string or Date object');
    }

    /**
     * Valida que el rango de fechas sea correcto
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @throws {InvalidDateRangeError} - Si el rango es inválido
     * @private
     */
    _validateDateRange(startDate, endDate) {
        // Verificar que la fecha de inicio es anterior a la de fin
        if (startDate > endDate) {
            throw new InvalidDateRangeError(
                'Start date must be before end date'
            );
        }

        // Verificar que el rango no es excesivamente grande
        const diffInDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

        if (diffInDays > 366) {
            throw new InvalidDateRangeError(
                'Date range cannot exceed 366 days'
            );
        }

        // Verificar que las fechas no son futuras
        const now = new Date();
        if (endDate > now) {
            throw new InvalidDateRangeError(
                'End date cannot be in the future'
            );
        }
    }

    /**
     * Valida que el alcance temporal es válido
     *
     * @param {string} timeScope - Alcance temporal a validar
     * @throws {Error} - Si el alcance temporal es inválido
     * @private
     */
    _validateTimeScope(timeScope) {
        const validScopes = ['hour', 'day', 'month', 'year'];

        if (!validScopes.includes(timeScope)) {
            throw new Error(
                `Invalid time scope: ${timeScope}. Valid values: ${validScopes.join(', ')}`
            );
        }
    }

    /**
     * Obtiene los datos en formato raw
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Alcance temporal
     * @param {Object} options - Opciones adicionales
     * @returns {Promise<Object>} - Datos en formato raw
     * @private
     */
    async _getRawData(startDate, endDate, timeScope, options) {
        const balanceData = await this.electricBalanceRepository.findByDateRange(
            startDate,
            endDate,
            timeScope,
            options
        );

        return {
            data: balanceData.map(balance => balance.toJSON()),
            meta: {
                startDate,
                endDate,
                timeScope,
                count: balanceData.length
            }
        };
    }

    /**
     * Obtiene los datos en formato de análisis
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Alcance temporal
     * @param {Object} options - Opciones adicionales
     * @returns {Promise<Object>} - Datos con análisis completo
     * @private
     */
    async _getAnalysisData(startDate, endDate, timeScope, options) {
        // Utilizar el servicio de dominio para análisis completo
        const analysisResult = await this.electricBalanceService.analyzeBalanceDataByDateRange(
            startDate,
            endDate,
            timeScope
        );

        // Si se solicitan patrones y anomalías, incluirlos
        if (options.includePatterns) {
            const patterns = await this.electricBalanceService.detectPatternsAndAnomalies(
                startDate,
                endDate,
                timeScope
            );

            return {
                ...analysisResult,
                patterns: patterns.patterns,
                anomalies: patterns.anomalies
            };
        }

        // Si se solicitan métricas de sostenibilidad, incluirlas
        if (options.includeSustainability) {
            const sustainability = await this.electricBalanceService.calculateSustainabilityMetrics(
                startDate,
                endDate,
                timeScope
            );

            return {
                ...analysisResult,
                sustainability: sustainability.metrics
            };
        }

        return analysisResult;
    }

    /**
     * Obtiene los datos en formato compacto
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Alcance temporal
     * @param {Object} options - Opciones adicionales
     * @returns {Promise<Object>} - Datos en formato compacto
     * @private
     */
    async _getCompactData(startDate, endDate, timeScope, options) {
        const balanceData = await this.electricBalanceRepository.findByDateRange(
            startDate,
            endDate,
            timeScope,
            options
        );

        // Transformar a formato compacto (solo los campos esenciales)
        const compactData = balanceData.map(balance => ({
            id: balance.id,
            timestamp: balance.timestamp,
            totalGeneration: balance.getTotalGeneration(),
            totalDemand: balance.getTotalDemand(),
            balance: balance.getBalance(),
            renewablePercentage: balance.getRenewablePercentage()
        }));

        // Obtener distribución de generación si se solicita
        let generationDistribution = null;
        if (options.includeDistribution) {
            generationDistribution = await this.electricBalanceRepository.getGenerationDistribution(
                startDate,
                endDate,
                timeScope
            );
        }

        return {
            data: compactData,
            meta: {
                startDate,
                endDate,
                timeScope,
                count: compactData.length
            },
            generationDistribution
        };
    }

    /**
     * Obtiene los datos en formato predeterminado
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Alcance temporal
     * @param {Object} options - Opciones adicionales
     * @returns {Promise<Object>} - Datos en formato predeterminado
     * @private
     */
    async _getDefaultData(startDate, endDate, timeScope, options) {
        const balanceData = await this.electricBalanceRepository.findByDateRange(
            startDate,
            endDate,
            timeScope,
            options
        );

        // Calcular totales y promedios
        let totalGeneration = 0;
        let totalDemand = 0;
        let totalRenewablePercentage = 0;

        const formattedData = balanceData.map(balance => {
            const generationValue = balance.getTotalGeneration();
            const demandValue = balance.getTotalDemand();
            const renewableValue = balance.getRenewablePercentage();

            totalGeneration += generationValue;
            totalDemand += demandValue;
            totalRenewablePercentage += renewableValue;

            return {
                id: balance.id,
                timestamp: balance.timestamp,
                generation: {
                    total: generationValue,
                    byType: balance.generation.map(gen => ({
                        type: gen.type,
                        value: gen.value,
                        percentage: gen.percentage,
                        color: gen.color
                    }))
                },
                demand: {
                    total: demandValue,
                    breakdown: balance.demand.map(dem => ({
                        type: dem.type,
                        value: dem.value,
                        percentage: dem.percentage
                    }))
                },
                interchange: balance.interchange.map(inter => ({
                    type: inter.type,
                    value: inter.value
                })),
                renewablePercentage: renewableValue
            };
        });

        // Calcular promedios
        const count = balanceData.length || 1; // Evitar división por cero
        const averageGeneration = totalGeneration / count;
        const averageDemand = totalDemand / count;
        const averageRenewablePercentage = totalRenewablePercentage / count;

        // Obtener la distribución de generación por tipo
        const generationByType = {};

        balanceData.forEach(balance => {
            balance.generation.forEach(gen => {
                if (!generationByType[gen.type]) {
                    generationByType[gen.type] = {
                        total: 0,
                        percentage: 0,
                        color: gen.color
                    };
                }

                generationByType[gen.type].total += gen.value;
            });
        });

        // Calcular porcentajes de la distribución total
        const totalGen = Object.values(generationByType)
            .reduce((sum, type) => sum + type.total, 0);

        Object.keys(generationByType).forEach(type => {
            generationByType[type].percentage =
                (generationByType[type].total / totalGen) * 100;
        });

        // Preparar series temporales para gráficos
        const timeSeries = {
            generation: formattedData.map(item => ({
                timestamp: item.timestamp,
                value: item.generation.total
            })),
            demand: formattedData.map(item => ({
                timestamp: item.timestamp,
                value: item.demand.total
            })),
            renewable: formattedData.map(item => ({
                timestamp: item.timestamp,
                value: item.renewablePercentage
            }))
        };

        return {
            meta: {
                startDate,
                endDate,
                timeScope,
                count: balanceData.length
            },
            summary: {
                totalGeneration,
                totalDemand,
                averageGeneration,
                averageDemand,
                averageRenewablePercentage,
                balance: totalGeneration - totalDemand
            },
            generationDistribution: generationByType,
            timeSeries,
            data: formattedData
        };
    }
}

module.exports = GetElectricBalanceByDateRange;
