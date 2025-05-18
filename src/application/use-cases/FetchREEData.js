/**
 * @file FetchREEData.js
 * @description Caso de uso para obtener datos de la API de REE y almacenarlos
 *
 * Este caso de uso se encarga de consultar la API pública de REE,
 * procesar los datos recibidos y almacenarlos en el repositorio.
 * Incluye manejo de errores, reintentos y validación de datos.
 */

const ElectricBalance = require('../../domain/entities/ElectricBalance');
const {
    ApiRequestError,
    ApiResponseError,
    RepositoryError
} = require('../errors/ApplicationErrors');

/**
 * Clase que implementa el caso de uso para obtener datos de la API de REE
 */
class FetchREEData {
    /**
     * Constructor del caso de uso
     *
     * @param {import('../../infrastructure/external/REEApiService')} reeApiService - Servicio para consumir la API de REE
     * @param {import('../../domain/repositories/ElectricBalanceRepository')} electricBalanceRepository - Repositorio de balance eléctrico
     * @param {Object} logger - Logger para registrar eventos y errores
     */
    constructor(reeApiService, electricBalanceRepository, logger) {
        this.reeApiService = reeApiService;
        this.electricBalanceRepository = electricBalanceRepository;
        this.logger = logger || console;
    }

    /**
     * Ejecuta el caso de uso para obtener datos de REE
     *
     * @param {Object} params - Parámetros del caso de uso
     * @param {Date|string} params.startDate - Fecha de inicio
     * @param {Date|string} params.endDate - Fecha de fin
     * @param {string} [params.timeScope='day'] - Granularidad temporal (hour, day, month, year)
     * @param {boolean} [params.forceUpdate=false] - Forzar actualización incluso si los datos ya existen
     * @param {number} [params.maxRetries=3] - Número máximo de reintentos en caso de fallo
     * @returns {Promise<Object>} - Resultado de la operación
     * @throws {ApiRequestError} - Si hay problemas al realizar la petición
     * @throws {ApiResponseError} - Si la respuesta de la API es incorrecta
     * @throws {RepositoryError} - Si hay problemas al guardar los datos
     */
    async execute({
                      startDate,
                      endDate,
                      timeScope = 'day',
                      forceUpdate = false,
                      maxRetries = 3
                  }) {
        const parsedStartDate = startDate instanceof Date ? startDate : new Date(startDate);
        const parsedEndDate = endDate instanceof Date ? endDate : new Date(endDate);

        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
            throw new ApiRequestError('Invalid date format');
        }

        try {
            this.logger.info(`Fetching REE data from ${parsedStartDate} to ${parsedEndDate} with timeScope ${timeScope}`);

            if (!forceUpdate) {
                const existingData = await this._checkExistingData(parsedStartDate, parsedEndDate, timeScope);

                if (existingData.complete) {
                    this.logger.info('Data already exists for this range and will not be updated');
                    return {
                        status: 'skipped',
                        message: 'Data already exists for this range',
                        existingCount: existingData.count
                    };
                }
            }

            const apiResponse = await this._fetchWithRetry(
                parsedStartDate,
                parsedEndDate,
                timeScope,
                maxRetries
            );

            if (!apiResponse || !apiResponse.data || !apiResponse.included) {
                throw new ApiResponseError('Invalid API response structure');
            }

            const electricBalances = await this._processApiResponse(apiResponse, timeScope);

            const savedCount = await this._saveProcessedData(electricBalances, forceUpdate);

            return {
                status: 'success',
                message: `Successfully fetched and saved data from REE API`,
                savedCount,
                timeScope,
                startDate: parsedStartDate,
                endDate: parsedEndDate
            };

        } catch (error) {
            this.logger.error(`Error fetching REE data: ${error.message}`, error);

            if (error instanceof ApiRequestError ||
                error instanceof ApiResponseError ||
                error instanceof RepositoryError) {
                throw error;
            }

            throw new ApiRequestError(
                `Failed to fetch data from REE API: ${error.message}`,
                { originalError: error }
            );
        }
    }

    /**
     * Verifica si ya existen datos para el rango de fechas
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Granularidad temporal
     * @returns {Promise<Object>} - Información sobre datos existentes
     * @private
     */
    async _checkExistingData(startDate, endDate, timeScope) {
        try {
            const existingData = await this.electricBalanceRepository.findByDateRange(
                startDate,
                endDate,
                timeScope,
                { onlyCount: true }
            );

            const expectedCount = this._calculateExpectedRecordCount(startDate, endDate, timeScope);

            const complete = (existingData.count >= expectedCount);

            return {
                complete,
                count: existingData.count,
                expected: expectedCount,
                missing: expectedCount - existingData.count
            };

        } catch (error) {
            this.logger.warn(`Error checking existing data: ${error.message}`);
            return { complete: false, count: 0, expected: 0, missing: 0 };
        }
    }

    /**
     * Calcula el número esperado de registros según el rango y granularidad
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Granularidad temporal
     * @returns {number} - Número esperado de registros
     * @private
     */
    _calculateExpectedRecordCount(startDate, endDate, timeScope) {
        const diffMs = endDate.getTime() - startDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        switch (timeScope) {
            case 'hour':
                return Math.ceil(diffDays * 24);
            case 'day':
                return Math.ceil(diffDays);
            case 'month':
                return Math.ceil(diffDays / 30);
            case 'year':
                return Math.ceil(diffDays / 365);
            default:
                return Math.ceil(diffDays);
        }
    }

    /**
     * Obtiene datos de la API con reintentos en caso de fallo
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Granularidad temporal
     * @param {number} maxRetries - Número máximo de reintentos
     * @returns {Promise<Object>} - Respuesta de la API
     * @throws {ApiRequestError} - Si no se puede obtener los datos después de los reintentos
     * @private
     */
    async _fetchWithRetry(startDate, endDate, timeScope, maxRetries) {
        let attempts = 0;
        let lastError = null;

        while (attempts < maxRetries) {
            try {
                attempts++;

                const formattedStartDate = this._formatDateForApi(startDate);
                const formattedEndDate = this._formatDateForApi(endDate);

                const response = await this.reeApiService.fetchBalanceData(
                    formattedStartDate,
                    formattedEndDate,
                    timeScope
                );

                return response;

            } catch (error) {
                lastError = error;

                this.logger.warn(
                    `Attempt ${attempts}/${maxRetries} failed: ${error.message}`
                );

                if (attempts < maxRetries) {
                    const delay = Math.pow(2, attempts) * 1000; // Backoff exponencial
                    this.logger.info(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new ApiRequestError(
            `Failed to fetch data after ${maxRetries} attempts: ${lastError.message}`,
            { originalError: lastError }
        );
    }

    /**
     * Formatea una fecha para la API de REE
     *
     * @param {Date} date - Fecha a formatear
     * @returns {string} - Fecha formateada
     * @private
     */
    _formatDateForApi(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    /**
     * Procesa la respuesta de la API y crea entidades de dominio
     *
     * @param {Object} apiResponse - Respuesta de la API
     * @param {string} timeScope - Granularidad temporal
     * @returns {Promise<Array<import('../../domain/entities/ElectricBalance')>>} - Entidades procesadas
     * @private
     */
    async _processApiResponse(apiResponse, timeScope) {
        this.logger.info('Processing API response');

        try {
            if (apiResponse.data &&
                apiResponse.data.attributes &&
                apiResponse.data.attributes.values &&
                Array.isArray(apiResponse.data.attributes.values)) {

                return apiResponse.data.attributes.values.map(dataPoint => {
                    const pointResponse = {
                        ...apiResponse,
                        data: {
                            ...apiResponse.data,
                            attributes: {
                                ...apiResponse.data.attributes,
                                'last-update': dataPoint.datetime || dataPoint.date,
                                'time-trunc': timeScope
                            }
                        }
                    };

                    return ElectricBalance.fromREEApiResponse(pointResponse);
                });
            } else {
                return [ElectricBalance.fromREEApiResponse(apiResponse)];
            }
        } catch (error) {
            throw new ApiResponseError(
                `Error processing API response: ${error.message}`,
                { originalError: error }
            );
        }
    }

    /**
     * Guarda las entidades procesadas en el repositorio
     *
     * @param {Array<import('../../domain/entities/ElectricBalance')>} electricBalances - Entidades a guardar
     * @param {boolean} forceUpdate - Si se debe forzar la actualización de datos existentes
     * @returns {Promise<number>} - Número de entidades guardadas
     * @throws {RepositoryError} - Si hay problemas al guardar los datos
     * @private
     */
    async _saveProcessedData(electricBalances, forceUpdate) {
        if (!electricBalances || electricBalances.length === 0) {
            this.logger.warn('No data to save');
            return 0;
        }

        try {
            this.logger.info(`Saving ${electricBalances.length} electric balance records`);
            this.logger.debug(`First record timestamp: ${electricBalances[0].timestamp}`);

            if (!forceUpdate) {
                const filteredBalances = [];

                for (const balance of electricBalances) {
                    const exists = await this.electricBalanceRepository.existsForDateAndScope(
                        balance.timestamp,
                        balance.timeScope
                    );

                    if (!exists) {
                        filteredBalances.push(balance);
                    }
                }

                if (filteredBalances.length === 0) {
                    this.logger.info('All records already exist in the database');
                    return 0;
                }

                await this.electricBalanceRepository.saveMany(filteredBalances);
                return filteredBalances.length;
            } else {
                await this.electricBalanceRepository.saveMany(electricBalances);
                return electricBalances.length;
            }
        } catch (error) {
            throw new RepositoryError(
                `Error saving electric balance data: ${error.message}`,
                { originalError: error }
            );
        }
    }
}

module.exports = FetchREEData;
