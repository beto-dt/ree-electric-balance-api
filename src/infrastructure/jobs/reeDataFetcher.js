/**
 * @file reeDataFetcher.js
 * @description Tarea programada para obtener datos de la API de REE
 *
 * Este archivo implementa un job que se ejecuta periódicamente para
 * consultar la API de REE, procesar los datos y almacenarlos en la base
 * de datos, manteniendo la información actualizada.
 */

const cron = require('node-cron');
const FetchREEData = require('../../application/use-cases/FetchREEData');

/**
 * Clase que gestiona la obtención programada de datos de REE
 */
class REEDataFetcher {
    /**
     * Constructor de la tarea programada
     *
     * @param {Object} reeApiService - Servicio para interactuar con la API de REE
     * @param {Object} electricBalanceRepository - Repositorio de balance eléctrico
     * @param {Object} logger - Logger para registrar eventos
     * @param {Object} config - Configuración de la tarea
     */
    constructor(reeApiService, electricBalanceRepository, logger, config = {}) {
        this.reeApiService = reeApiService;
        this.electricBalanceRepository = electricBalanceRepository;
        this.logger = logger;
        this.config = {
            // Configuración por defecto
            schedule: config.schedule || '0 */1 * * *', // Cada hora por defecto
            timeScopes: config.timeScopes || ['hour', 'day'],
            enabled: config.enabled !== undefined ? config.enabled : true,
            initialFetch: config.initialFetch !== undefined ? config.initialFetch : true,
            retryOnFailure: config.retryOnFailure !== undefined ? config.retryOnFailure : true,
            retryDelay: config.retryDelay || 5 * 60 * 1000, // 5 minutos
            maxRetries: config.maxRetries || 3,
            forceUpdate: config.forceUpdate || false,
            // Períodos históricos a obtener (en días)
            historicalPeriods: {
                hour: config.historicalPeriods?.hour || 2, // 2 días de datos horarios
                day: config.historicalPeriods?.day || 60, // 60 días de datos diarios
                month: config.historicalPeriods?.month || 365, // 1 año de datos mensuales
                year: config.historicalPeriods?.year || 1825 // 5 años de datos anuales
            }
        };

        this.jobs = [];
        this.running = false;
        this.fetchInProgress = false;
        this.retryCount = 0;
    }

    /**
     * Inicia las tareas programadas
     * @returns {Promise<void>}
     */
    async start() {
        if (this.running) {
            this.logger.warn('REE data fetcher is already running');
            return;
        }

        this.running = true;
        this.logger.info('Starting REE data fetcher');

        try {
            // Realizar obtención inicial de datos históricos si está configurado
            if (this.config.initialFetch) {
                await this._performInitialFetch();
            }

            // Programar tareas periódicas para cada timeScope
            this._scheduleJobs();

            this.logger.info('REE data fetcher started successfully');
        } catch (error) {
            this.logger.error(`Error starting REE data fetcher: ${error.message}`, error);
            this.running = false;
            throw error;
        }
    }

    /**
     * Detiene las tareas programadas
     */
    stop() {
        if (!this.running) {
            return;
        }

        this.logger.info('Stopping REE data fetcher');

        // Detener todas las tareas programadas
        this.jobs.forEach(job => job.stop());
        this.jobs = [];
        this.running = false;

        this.logger.info('REE data fetcher stopped');
    }

    /**
     * Ejecuta manualmente la obtención de datos para un período específico
     *
     * @param {Object} params - Parámetros de la obtención
     * @param {Date} params.startDate - Fecha de inicio
     * @param {Date} params.endDate - Fecha de fin
     * @param {string} params.timeScope - Alcance temporal (hour, day, month, year)
     * @param {boolean} params.forceUpdate - Forzar actualización incluso si ya existen datos
     * @returns {Promise<Object>} - Resultado de la obtención
     */
    async fetchDataManually(params) {
        this.logger.info(`Manual data fetch requested: ${JSON.stringify(params)}`);

        if (this.fetchInProgress) {
            const message = 'Another fetch operation is already in progress';
            this.logger.warn(message);
            return { success: false, message };
        }

        try {
            this.fetchInProgress = true;
            const result = await this._fetchData(params);
            return result;
        } catch (error) {
            this.logger.error(`Error in manual fetch: ${error.message}`, error);
            return {
                success: false,
                message: `Error: ${error.message}`,
                error: error.toString()
            };
        } finally {
            this.fetchInProgress = false;
        }
    }

    /**
     * Obtiene el estado actual del fetcher
     *
     * @returns {Object} - Estado actual
     */
    getStatus() {
        return {
            running: this.running,
            fetchInProgress: this.fetchInProgress,
            jobsCount: this.jobs.length,
            scheduledTimeScopes: this.config.timeScopes,
            retryCount: this.retryCount,
            lastFetchTime: this.lastFetchTime || null,
            config: {
                ...this.config,
                // No incluir información sensible
                credentials: this.config.credentials ? '***' : undefined
            }
        };
    }

    /**
     * Programa las tareas periódicas
     * @private
     */
    _scheduleJobs() {
        // Limpiar jobs existentes
        this.jobs.forEach(job => job.stop());
        this.jobs = [];

        if (!this.config.enabled) {
            this.logger.info('Scheduled jobs are disabled in configuration');
            return;
        }

        // Crear una tarea para cada timeScope
        this.config.timeScopes.forEach(timeScope => {
            const job = cron.schedule(this.config.schedule, async () => {
                await this._executeScheduledFetch(timeScope);
            });

            this.jobs.push(job);
            this.logger.info(`Scheduled job for ${timeScope} data with schedule: ${this.config.schedule}`);
        });
    }

    /**
     * Ejecuta una obtención programada
     *
     * @param {string} timeScope - Alcance temporal (hour, day, month, year)
     * @private
     */
    async _executeScheduledFetch(timeScope) {
        if (this.fetchInProgress) {
            this.logger.warn(`Skipping scheduled ${timeScope} fetch because another fetch is in progress`);
            return;
        }

        this.logger.info(`Executing scheduled fetch for ${timeScope} data`);

        try {
            this.fetchInProgress = true;

            // Calcular período para la obtención según el timeScope
            const params = this._calculateFetchPeriod(timeScope);

            // Ejecutar obtención
            const result = await this._fetchData({
                ...params,
                timeScope,
                forceUpdate: this.config.forceUpdate
            });

            this.logger.info(`Scheduled ${timeScope} fetch completed: ${result.message}`);
            this.lastFetchTime = new Date();
            this.retryCount = 0;

        } catch (error) {
            this.logger.error(`Error in scheduled ${timeScope} fetch: ${error.message}`, error);

            // Reintento si está configurado
            if (this.config.retryOnFailure && this.retryCount < this.config.maxRetries) {
                this.retryCount++;
                this._scheduleRetry(timeScope);
            }
        } finally {
            this.fetchInProgress = false;
        }
    }

    /**
     * Programa un reintento de obtención
     *
     * @param {string} timeScope - Alcance temporal
     * @private
     */
    _scheduleRetry(timeScope) {
        const delay = this.config.retryDelay;

        this.logger.info(`Scheduling retry for ${timeScope} fetch in ${delay / 1000} seconds (attempt ${this.retryCount}/${this.config.maxRetries})`);

        setTimeout(async () => {
            await this._executeScheduledFetch(timeScope);
        }, delay);
    }

    /**
     * Ejecuta la obtención inicial de datos históricos
     * @private
     */
    async _performInitialFetch() {
        this.logger.info('Performing initial historical data fetch');

        for (const timeScope of this.config.timeScopes) {
            try {
                // Calcular período histórico según configuración
                const daysToFetch = this.config.historicalPeriods[timeScope] || 30;

                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - daysToFetch);

                this.logger.info(`Fetching historical ${timeScope} data from ${startDate.toISOString()} to ${endDate.toISOString()}`);

                // Ejecutar obtención de datos históricos
                await this._fetchData({
                    startDate,
                    endDate,
                    timeScope,
                    forceUpdate: false // No forzar actualización para datos históricos
                });

                this.logger.info(`Historical ${timeScope} data fetch completed`);
            } catch (error) {
                this.logger.error(`Error fetching historical ${timeScope} data: ${error.message}`, error);
                // Continuar con el siguiente timeScope aunque haya error
            }
        }
    }

    /**
     * Calcula el período para la obtención según el timeScope
     *
     * @param {string} timeScope - Alcance temporal
     * @returns {Object} - Período calculado (startDate, endDate)
     * @private
     */
    _calculateFetchPeriod(timeScope) {
        const now = new Date();
        const startDate = new Date();

        switch (timeScope) {
            case 'hour':
                // Últimas 24 horas
                startDate.setHours(startDate.getHours() - 24);
                break;
            case 'day':
                // Últimos 7 días
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                // Últimos 3 meses
                startDate.setMonth(startDate.getMonth() - 3);
                break;
            case 'year':
                // Último año
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                // Por defecto, último día
                startDate.setDate(startDate.getDate() - 1);
        }

        return { startDate, endDate: now };
    }

    /**
     * Ejecuta la obtención de datos
     *
     * @param {Object} params - Parámetros de la obtención
     * @returns {Promise<Object>} - Resultado de la obtención
     * @private
     */
    async _fetchData(params) {
        try {
            // Crear instancia del caso de uso
            const fetchREEDataUseCase = new FetchREEData(
                this.reeApiService,
                this.electricBalanceRepository,
                this.logger
            );

            // Ejecutar caso de uso
            const result = await fetchREEDataUseCase.execute({
                startDate: params.startDate,
                endDate: params.endDate,
                timeScope: params.timeScope,
                forceUpdate: params.forceUpdate
            });

            return {
                success: true,
                message: result.message,
                savedCount: result.savedCount,
                status: result.status,
                skipped: result.status === 'skipped',
                startDate: result.startDate,
                endDate: result.endDate,
                timeScope: result.timeScope
            };
        } catch (error) {
            this.logger.error(`Error in _fetchData: ${error.message}`, error);
            throw error;
        }
    }
}

module.exports = REEDataFetcher;
