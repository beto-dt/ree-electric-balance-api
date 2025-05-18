/**
 * @file schedulers.js
 * @description Configuración y gestión de tareas programadas de la aplicación
 *
 * Este archivo configura y gestiona las tareas programadas que se ejecutan
 * periódicamente, como la obtención de datos de la API de REE.
 */

const REEDataFetcher = require('../infrastructure/jobs/reeDataFetcher');
const config = require('./environment');
const logger = require('./logger').createComponentLogger('schedulers');

/**
 * Clase que gestiona todas las tareas programadas de la aplicación
 */
class SchedulerManager {
    /**
     * Constructor del gestor de tareas programadas
     *
     * @param {Object} services - Servicios inyectados
     * @param {Object} repositories - Repositorios inyectados
     */
    constructor(services, repositories) {
        this.services = services;
        this.repositories = repositories;
        this.schedulers = {};
        this.isInitialized = false;
    }

    /**
     * Inicializa todas las tareas programadas
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            logger.warn('Schedulers are already initialized');
            return;
        }

        logger.info('Initializing schedulers');

        try {
            if (!config.scheduling.enabled) {
                logger.info('Schedulers are disabled in configuration');
                return;
            }

            await this._initREEDataFetcher();


            this.isInitialized = true;
            logger.info('All schedulers initialized successfully');
        } catch (error) {
            logger.error(`Error initializing schedulers: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Detiene todas las tareas programadas
     *
     * @returns {Promise<void>}
     */
    async shutdown() {
        logger.info('Shutting down schedulers');

        try {
            if (this.schedulers.reeDataFetcher) {
                this.schedulers.reeDataFetcher.stop();
                logger.info('REE data fetcher stopped');
            }


            this.isInitialized = false;
            logger.info('All schedulers shut down successfully');
        } catch (error) {
            logger.error(`Error shutting down schedulers: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Obtiene el estado de todas las tareas programadas
     *
     * @returns {Object} - Estado de todas las tareas
     */
    getStatus() {
        const status = {
            isInitialized: this.isInitialized,
            enabled: config.scheduling.enabled,
            schedulers: {}
        };

        if (this.schedulers.reeDataFetcher) {
            status.schedulers.reeDataFetcher = this.schedulers.reeDataFetcher.getStatus();
        }


        return status;
    }

    /**
     * Inicializa la tarea de obtención de datos de REE
     *
     * @returns {Promise<void>}
     * @private
     */
    async _initREEDataFetcher() {
        logger.info('Initializing REE data fetcher scheduler');

        try {
            const timeScopes = ['hour', 'day', 'month'];
            const schedulers = {};

            for (const timeScope of timeScopes) {
                const schedule = this._getScheduleForTimeScope(timeScope);
                const fetcher = new REEDataFetcher(
                    this.services.reeApiService,
                    this.repositories.electricBalanceRepository,
                    logger.child({ component: `reeDataFetcher-${timeScope}` }),
                    {
                        schedule,
                        timeScopes: [timeScope],
                        enabled: config.scheduling.enabled,
                        initialFetch: config.scheduling.initialFetch,
                        historicalPeriods: config.scheduling.historicalPeriods,
                        retryOnFailure: true,
                        retryDelay: 5 * 60 * 1000,
                        maxRetries: 3
                    }
                );

                await fetcher.start();

                schedulers[timeScope] = fetcher;
                logger.info(`REE data fetcher for ${timeScope} initialized with schedule: ${schedule}`);
            }

            this.schedulers.reeDataFetcher = schedulers.hour;
            this.schedulers.reeDataFetcher.allFetchers = schedulers;

            const originalStop = this.schedulers.reeDataFetcher.stop;
            this.schedulers.reeDataFetcher.stop = () => {
                Object.values(schedulers).forEach(fetcher => originalStop.call(fetcher));
            };

            const originalGetStatus = this.schedulers.reeDataFetcher.getStatus;
            this.schedulers.reeDataFetcher.getStatus = () => {
                const status = {
                    fetchers: {}
                };

                Object.entries(schedulers).forEach(([scope, fetcher]) => {
                    status.fetchers[scope] = originalGetStatus.call(fetcher);
                });

                return status;
            };

            this.schedulers.reeDataFetcher.fetchDataManually = async (params) => {
                const timeScope = params.timeScope || 'hour';

                if (!schedulers[timeScope]) {
                    throw new Error(`No fetcher for timeScope: ${timeScope}`);
                }

                return schedulers[timeScope].fetchDataManually(params);
            };

            logger.info('REE data fetcher scheduler initialized successfully');
        } catch (error) {
            logger.error(`Error initializing REE data fetcher: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Obtiene la expresión cron para un timeScope específico
     *
     * @param {string} timeScope - Alcance temporal (hour, day, month)
     * @returns {string} - Expresión cron
     * @private
     */
    _getScheduleForTimeScope(timeScope) {
        switch (timeScope) {
            case 'hour':
                return config.scheduling.hourlyFetchCron;
            case 'day':
                return config.scheduling.dailyFetchCron;
            case 'month':
                return config.scheduling.monthlyFetchCron;
            default:
                return config.scheduling.hourlyFetchCron;
        }
    }
}

const schedulerManager = new SchedulerManager();

module.exports = {
    SchedulerManager,
    schedulerManager
};
