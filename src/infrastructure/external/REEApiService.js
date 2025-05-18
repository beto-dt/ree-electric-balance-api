/**
 * @file REEApiService.js
 * @description Servicio para interactuar con la API pública de REE (Red Eléctrica de España)
 *
 * Este servicio encapsula toda la lógica de comunicación con la API de REE,
 * proporcionando métodos para obtener datos de balance eléctrico y gestionar
 * errores de forma robusta.
 */

const axios = require('axios');
const { ApiRequestError, ApiResponseError, NetworkError } = require('../../application/errors/ApplicationErrors');

/**
 * Clase que implementa el servicio para interactuar con la API de REE
 */
class REEApiService {
    /**
     * Constructor del servicio
     *
     * @param {Object} config - Configuración del servicio
     * @param {string} config.baseUrl - URL base de la API de REE
     * @param {number} config.timeout - Timeout para las peticiones en ms
     * @param {Object} config.headers - Headers adicionales para las peticiones
     * @param {Object} logger - Logger para registro de eventos
     */
    constructor(config = {}, logger = console) {
        this.baseUrl = config.baseUrl || 'https://apidatos.ree.es';
        this.timeout = config.timeout || 10000; // 10 segundos por defecto
        this.headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...config.headers
        };
        this.logger = logger;

        // Crear instancia de axios con configuración base
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: this.headers
        });

        // Configurar interceptores para logging
        this._setupInterceptors();
    }

    /**
     * Obtiene datos de balance eléctrico de la API de REE
     *
     * @param {string} startDate - Fecha de inicio en formato ISO o 'YYYY-MM-DDThh:mm'
     * @param {string} endDate - Fecha de fin en formato ISO o 'YYYY-MM-DDThh:mm'
     * @param {string} timeScope - Granularidad temporal (hour, day, month, year)
     * @param {Object} options - Opciones adicionales para la petición
     * @returns {Promise<Object>} - Respuesta de la API con los datos de balance eléctrico
     * @throws {ApiRequestError} - Si hay problemas con la petición
     * @throws {ApiResponseError} - Si la respuesta de la API no es válida
     * @throws {NetworkError} - Si hay problemas de red
     */
    async fetchBalanceData(startDate, endDate, timeScope = 'day', options = {}) {
        try {
            // Construir la URL del endpoint
            const endpoint = '/es/datos/balance/balance-electrico';

            // Construir los query params
            const params = {
                start_date: startDate,
                end_date: endDate,
                time_trunc: timeScope,
                ...options
            };

            this.logger.info(`Fetching electric balance data from REE API: ${startDate} to ${endDate} (${timeScope})`);

            // Realizar la petición a la API
            const response = await this.client.get(endpoint, { params });

            // Verificar respuesta
            if (!response.data) {
                throw new ApiResponseError(
                    'Empty response from REE API',
                    { endpoint, statusCode: response.status }
                );
            }

            return response.data;
        } catch (error) {
            return this._handleApiError(error, 'fetchBalanceData', { startDate, endDate, timeScope });
        }
    }

    /**
     * Obtiene la geo información del balance eléctrico
     *
     * @param {string} startDate - Fecha de inicio
     * @param {string} endDate - Fecha de fin
     * @param {string} timeScope - Granularidad temporal
     * @param {string} region - Código de región (opcional)
     * @returns {Promise<Object>} - Datos de geo balance
     * @throws {ApiRequestError|ApiResponseError|NetworkError} - Si hay errores
     */
    async fetchGeoBalance(startDate, endDate, timeScope = 'day', region = null) {
        try {
            // Construir la URL del endpoint
            const endpoint = '/es/datos/balance/balance-electrico-geolocalized';

            // Construir los query params
            const params = {
                start_date: startDate,
                end_date: endDate,
                time_trunc: timeScope
            };

            // Añadir región si se especifica
            if (region) {
                params.region = region;
            }

            this.logger.info(`Fetching geo balance data from REE API: ${startDate} to ${endDate} (${timeScope})`);

            // Realizar la petición a la API
            const response = await this.client.get(endpoint, { params });

            // Verificar respuesta
            if (!response.data) {
                throw new ApiResponseError(
                    'Empty response from REE API',
                    { endpoint, statusCode: response.status }
                );
            }

            return response.data;
        } catch (error) {
            return this._handleApiError(error, 'fetchGeoBalance', { startDate, endDate, timeScope, region });
        }
    }

    /**
     * Obtiene los indicadores de balance eléctrico
     *
     * @param {string} startDate - Fecha de inicio
     * @param {string} endDate - Fecha de fin
     * @param {string} timeScope - Granularidad temporal
     * @returns {Promise<Object>} - Indicadores de balance
     * @throws {ApiRequestError|ApiResponseError|NetworkError} - Si hay errores
     */
    async fetchBalanceIndicators(startDate, endDate, timeScope = 'day') {
        try {
            // Construir la URL del endpoint
            const endpoint = '/es/datos/balance/balance-electrico-indicadores';

            // Construir los query params
            const params = {
                start_date: startDate,
                end_date: endDate,
                time_trunc: timeScope
            };

            this.logger.info(`Fetching balance indicators from REE API: ${startDate} to ${endDate} (${timeScope})`);

            // Realizar la petición a la API
            const response = await this.client.get(endpoint, { params });

            // Verificar respuesta
            if (!response.data) {
                throw new ApiResponseError(
                    'Empty response from REE API',
                    { endpoint, statusCode: response.status }
                );
            }

            return response.data;
        } catch (error) {
            return this._handleApiError(error, 'fetchBalanceIndicators', { startDate, endDate, timeScope });
        }
    }

    /**
     * Verifica el estado de la API de REE
     *
     * @returns {Promise<Object>} - Estado de la API
     * @throws {ApiRequestError|ApiResponseError|NetworkError} - Si hay errores
     */
    async checkApiStatus() {
        try {
            // Usar un endpoint simple para verificar disponibilidad
            const response = await this.client.get('/es/datos', {
                timeout: 5000 // Timeout más corto para esta operación
            });

            return {
                status: 'available',
                responseTime: response.headers['x-response-time'] || 'unknown',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.warn(`REE API status check failed: ${error.message}`);

            return {
                status: 'unavailable',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Obtiene los tipos disponibles de generación eléctrica
     *
     * @returns {Promise<Array<Object>>} - Lista de tipos de generación
     * @throws {ApiRequestError|ApiResponseError|NetworkError} - Si hay errores
     */
    async fetchGenerationTypes() {
        try {
            // Solicitar un período mínimo solo para obtener los tipos
            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const startDate = this._formatDate(yesterday);
            const endDate = this._formatDate(now);

            // Obtener datos de balance
            const response = await this.fetchBalanceData(startDate, endDate, 'day');

            // Extraer los tipos de generación
            if (response && response.included) {
                const generationData = response.included.find(item =>
                    item.type === 'generation'
                );

                if (generationData && generationData.attributes && generationData.attributes.content) {
                    return generationData.attributes.content.map(item => ({
                        type: item.type,
                        color: item.color || null,
                        renewable: this._isRenewableType(item.type)
                    }));
                }
            }

            throw new ApiResponseError(
                'Could not extract generation types from API response',
                { endpoint: '/es/datos/balance/balance-electrico' }
            );
        } catch (error) {
            return this._handleApiError(error, 'fetchGenerationTypes');
        }
    }

    /**
     * Obtiene metadatos sobre la API de REE
     *
     * @returns {Promise<Object>} - Metadatos de la API
     * @throws {ApiRequestError|ApiResponseError|NetworkError} - Si hay errores
     */
    async fetchApiMetadata() {
        try {
            // Obtener metadatos de la API
            const response = await this.client.get('/es/datos/catalogo');

            // Verificar respuesta
            if (!response.data) {
                throw new ApiResponseError(
                    'Empty response from REE API',
                    { endpoint: '/es/datos/catalogo', statusCode: response.status }
                );
            }

            return response.data;
        } catch (error) {
            return this._handleApiError(error, 'fetchApiMetadata');
        }
    }

    /**
     * Configura interceptores para peticiones y respuestas
     *
     * @private
     */
    _setupInterceptors() {
        // Interceptor para peticiones
        this.client.interceptors.request.use(
            config => {
                const { method, url, params, data } = config;
                this.logger.debug(`REE API Request: ${method?.toUpperCase()} ${url}`, { params });

                return config;
            },
            error => {
                this.logger.error(`REE API Request Error: ${error.message}`);
                return Promise.reject(error);
            }
        );

        // Interceptor para respuestas
        this.client.interceptors.response.use(
            response => {
                const { status, config, headers } = response;
                const responseTime = headers['x-response-time'] || 'unknown';

                this.logger.debug(
                    `REE API Response: ${status} from ${config.method?.toUpperCase()} ${config.url} (${responseTime})`
                );

                return response;
            },
            error => {
                const { config, response } = error;
                const status = response ? response.status : 'network error';

                this.logger.error(
                    `REE API Response Error: ${status} from ${config?.method?.toUpperCase()} ${config?.url}: ${error.message}`
                );

                return Promise.reject(error);
            }
        );
    }

    /**
     * Maneja errores de la API de forma consistente
     *
     * @param {Error} error - Error producido
     * @param {string} operation - Operación que produjo el error
     * @param {Object} params - Parámetros de la operación
     * @returns {never} - Nunca retorna, siempre lanza una excepción
     * @throws {ApiRequestError|ApiResponseError|NetworkError} - Error específico según el caso
     * @private
     */
    _handleApiError(error, operation, params = {}) {
        // Si es un error de red (sin respuesta)
        if (!error.response) {
            if (error.code === 'ECONNABORTED') {
                throw new NetworkError(
                    `Timeout when connecting to REE API: ${error.message}`,
                    {
                        isTimeout: true,
                        originalError: error,
                        resource: 'REE API',
                        action: operation
                    }
                );
            }

            throw new NetworkError(
                `Network error when connecting to REE API: ${error.message}`,
                {
                    originalError: error,
                    resource: 'REE API',
                    action: operation
                }
            );
        }

        // Si es un error de respuesta HTTP
        if (error.response) {
            const { status, data } = error.response;

            // Error de cliente (4xx)
            if (status >= 400 && status < 500) {
                throw new ApiRequestError(
                    `Client error when calling REE API: ${status} ${data?.message || error.message}`,
                    {
                        statusCode: status,
                        originalError: error,
                        endpoint: error.config?.url,
                        requestParams: params
                    }
                );
            }

            // Error de servidor (5xx)
            if (status >= 500) {
                throw new ApiResponseError(
                    `Server error from REE API: ${status} ${data?.message || error.message}`,
                    {
                        statusCode: status,
                        originalError: error,
                        endpoint: error.config?.url,
                        response: data
                    }
                );
            }
        }

        // Para cualquier otro tipo de error
        throw new ApiRequestError(
            `Error when calling REE API: ${error.message}`,
            {
                originalError: error,
                endpoint: error.config?.url,
                requestParams: params
            }
        );
    }

    /**
     * Formatea una fecha para la API de REE
     *
     * @param {Date} date - Fecha a formatear
     * @returns {string} - Fecha formateada
     * @private
     */
    _formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    /**
     * Determina si un tipo de generación es renovable
     *
     * @param {string} type - Tipo de generación
     * @returns {boolean} - true si es renovable, false si no
     * @private
     */
    _isRenewableType(type) {
        const renewableTypes = [
            'Hidráulica', 'Eólica', 'Solar fotovoltaica', 'Solar térmica',
            'Otras renovables', 'Hidroeólica'
        ];

        return renewableTypes.includes(type);
    }
}

module.exports = REEApiService;
