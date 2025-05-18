/**
 * @file errorHandler.js
 * @description Utilidades para manejo consistente de errores en la aplicación
 *
 * Este archivo contiene funciones para manejar diferentes tipos de errores,
 * incluyendo errores de API, de base de datos, de validación y errores generales,
 * proporcionando un enfoque unificado para todo el sistema.
 */

const {
    ApplicationError,
    ApiRequestError,
    ApiResponseError,
    RepositoryError,
    InvalidDateRangeError,
    ValidationError,
    NotFoundError,
    BusinessRuleViolationError
} = require('../application/errors/ApplicationErrors');

/**
 * Maneja un error y devuelve una respuesta de error estandarizada
 *
 * @param {Error} error - Error a manejar
 * @param {Object} logger - Logger para registrar el error
 * @param {boolean} includeStack - Si se debe incluir el stack trace en la respuesta
 * @returns {Object} - Respuesta de error estandarizada
 */
function handleError(error, logger, includeStack = false) {
    // Registrar el error
    if (logger) {
        logger.error(`Error: ${error.message}`, {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                ...(error.metadata || {})
            }
        });
    }

    // Construir respuesta base
    const errorResponse = {
        success: false,
        error: {
            type: error.name || 'UnknownError',
            message: error.message || 'An unknown error occurred',
            code: error.code || getErrorCodeFromType(error)
        }
    };

    // Añadir detalles específicos según el tipo de error
    if (error instanceof ValidationError) {
        errorResponse.error.validationErrors = error.validationErrors || {};
        errorResponse.error.code = errorResponse.error.code || 'VALIDATION_ERROR';
    }

    if (error instanceof ApiRequestError || error instanceof ApiResponseError) {
        errorResponse.error.endpoint = error.endpoint;
        errorResponse.error.statusCode = error.statusCode;
        errorResponse.error.code = errorResponse.error.code || 'API_ERROR';
    }

    if (error instanceof RepositoryError) {
        errorResponse.error.entity = error.entity;
        errorResponse.error.operation = error.operation;
        errorResponse.error.code = errorResponse.error.code || 'DATABASE_ERROR';
    }

    if (error instanceof InvalidDateRangeError) {
        errorResponse.error.code = errorResponse.error.code || 'INVALID_DATE_RANGE';
    }

    if (error instanceof NotFoundError) {
        errorResponse.error.resourceType = error.resourceType;
        errorResponse.error.resourceId = error.resourceId;
        errorResponse.error.code = errorResponse.error.code || 'NOT_FOUND';
    }

    if (error instanceof BusinessRuleViolationError) {
        errorResponse.error.rule = error.rule;
        errorResponse.error.code = errorResponse.error.code || 'BUSINESS_RULE_VIOLATION';
    }

    // Añadir stack trace en entornos de desarrollo o si se solicita explícitamente
    if ((process.env.NODE_ENV !== 'production' || includeStack) && error.stack) {
        errorResponse.error.stack = error.stack;
    }

    // Añadir metadatos si existen
    if (error.metadata) {
        errorResponse.error.metadata = error.metadata;
    }

    // Añadir error original si existe
    if (error.originalError && process.env.NODE_ENV !== 'production') {
        errorResponse.error.originalError = {
            name: error.originalError.name,
            message: error.originalError.message,
            ...(includeStack ? { stack: error.originalError.stack } : {})
        };
    }

    return errorResponse;
}

/**
 * Maneja errores de API específicos
 *
 * @param {Error} error - Error de API
 * @param {Object} logger - Logger para registrar el error
 * @returns {Object} - Respuesta de error estandarizada
 */
function handleApiError(error, logger) {
    // Si ya es un error de API, procesarlo directamente
    if (error instanceof ApiRequestError || error instanceof ApiResponseError) {
        return handleError(error, logger);
    }

    // Si es un error de red o timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        const apiError = new ApiRequestError(
            `Connection error when calling API: ${error.message}`,
            {
                originalError: error,
                code: 'CONNECTION_ERROR'
            }
        );

        return handleError(apiError, logger);
    }

    // Si es un error de HTTP
    if (error.response) {
        const { status, data } = error.response;

        // Error 4xx
        if (status >= 400 && status < 500) {
            const apiError = new ApiRequestError(
                `Client error: ${status} ${data?.message || error.message}`,
                {
                    originalError: error,
                    endpoint: error.config?.url,
                    statusCode: status,
                    code: `HTTP_${status}`
                }
            );

            return handleError(apiError, logger);
        }

        // Error 5xx
        if (status >= 500) {
            const apiError = new ApiResponseError(
                `Server error: ${status} ${data?.message || error.message}`,
                {
                    originalError: error,
                    endpoint: error.config?.url,
                    statusCode: status,
                    code: `HTTP_${status}`
                }
            );

            return handleError(apiError, logger);
        }
    }

    // Otros errores de API
    const apiError = new ApiRequestError(
        `API error: ${error.message}`,
        {
            originalError: error,
            code: 'API_ERROR'
        }
    );

    return handleError(apiError, logger);
}

/**
 * Maneja errores de base de datos
 *
 * @param {Error} error - Error de base de datos
 * @param {Object} logger - Logger para registrar el error
 * @param {string} entity - Entidad afectada
 * @param {string} operation - Operación que falló
 * @returns {Object} - Respuesta de error estandarizada
 */
function handleDatabaseError(error, logger, entity, operation) {
    // Si ya es un error de repositorio, procesarlo directamente
    if (error instanceof RepositoryError) {
        return handleError(error, logger);
    }

    // Error de MongoDB específico
    let dbError;

    // Error de duplicación (violación de índice único)
    if (error.code === 11000) {
        dbError = new RepositoryError(
            `Duplicate entry: ${JSON.stringify(error.keyValue)}`,
            {
                originalError: error,
                entity,
                operation,
                code: 'DUPLICATE_ENTRY',
                metadata: { keyValue: error.keyValue }
            }
        );
    }
    // Error de validación de Mongoose
    else if (error.name === 'ValidationError') {
        const validationErrors = {};

        // Extraer errores de validación
        if (error.errors) {
            Object.keys(error.errors).forEach(key => {
                validationErrors[key] = error.errors[key].message;
            });
        }

        dbError = new RepositoryError(
            `Validation error: ${error.message}`,
            {
                originalError: error,
                entity,
                operation,
                code: 'DB_VALIDATION_ERROR',
                metadata: { validationErrors }
            }
        );
    }
    // Error general de base de datos
    else {
        dbError = new RepositoryError(
            `Database error: ${error.message}`,
            {
                originalError: error,
                entity,
                operation,
                code: determineMongoErrorCode(error)
            }
        );
    }

    return handleError(dbError, logger);
}

/**
 * Maneja errores de validación
 *
 * @param {Error|Object} error - Error de validación o objeto con errores
 * @param {Object} logger - Logger para registrar el error
 * @returns {Object} - Respuesta de error estandarizada
 */
function handleValidationError(error, logger) {
    // Si ya es un error de validación, procesarlo directamente
    if (error instanceof ValidationError) {
        return handleError(error, logger);
    }

    // Si es un objeto de errores de validación
    if (typeof error === 'object' && !error.message) {
        const validationError = new ValidationError(
            'Validation failed',
            {
                validationErrors: error,
                code: 'VALIDATION_ERROR'
            }
        );

        return handleError(validationError, logger);
    }

    // Error general de validación
    const validationError = new ValidationError(
        `Validation error: ${error.message || 'Invalid data provided'}`,
        {
            originalError: error,
            code: 'VALIDATION_ERROR',
            validationErrors: error.validationErrors || error.errors || {}
        }
    );

    return handleError(validationError, logger);
}

/**
 * Maneja errores específicos de la API de REE
 *
 * @param {Error} error - Error de la API de REE
 * @param {Object} logger - Logger para registrar el error
 * @returns {Object} - Respuesta de error estandarizada
 */
function handleREEApiError(error, logger) {
    // Error específico de la API de REE
    let reeError;

    // Si es un error de timeout
    if (error.code === 'ECONNABORTED') {
        reeError = new ApiRequestError(
            'REE API timeout: The request took too long to complete',
            {
                originalError: error,
                endpoint: error.config?.url,
                code: 'REE_API_TIMEOUT'
            }
        );
    }
    // Si es un error de respuesta
    else if (error.response) {
        const { status, data } = error.response;

        // Mapear códigos de estado a mensajes específicos
        let message;
        switch (status) {
            case 400:
                message = 'REE API rejected the request: Invalid parameters';
                break;
            case 401:
                message = 'REE API authentication failed';
                break;
            case 404:
                message = 'REE API resource not found';
                break;
            case 429:
                message = 'REE API rate limit exceeded';
                break;
            case 500:
                message = 'REE API internal server error';
                break;
            default:
                message = `REE API error: ${status} ${data?.message || error.message}`;
        }

        reeError = new ApiResponseError(
            message,
            {
                originalError: error,
                endpoint: error.config?.url,
                statusCode: status,
                code: `REE_API_${status}`
            }
        );
    }
    // Si es un error de fecha
    else if (error instanceof InvalidDateRangeError) {
        reeError = error;
    }
    // Si es otro tipo de error
    else {
        reeError = new ApiRequestError(
            `REE API error: ${error.message}`,
            {
                originalError: error,
                code: 'REE_API_ERROR'
            }
        );
    }

    return handleError(reeError, logger);
}

/**
 * Middleware para manejo de errores en Express
 *
 * @param {Object} logger - Logger para registrar errores
 * @returns {Function} - Middleware de Express
 */
function errorMiddleware(logger) {
    return (err, req, res, next) => {
        // Usar el logger de la petición si existe
        const log = req.logger || logger;

        // Generar respuesta de error
        const errorResponse = handleError(err, log);

        // Determinar código de estado HTTP
        const statusCode = getHttpStatusFromError(err);

        // Enviar respuesta al cliente
        res.status(statusCode).json(errorResponse);
    };
}

/**
 * Determina el código de HTTP desde un tipo de error
 *
 * @param {Error} error - Error a procesar
 * @returns {number} - Código de estado HTTP
 */
function getHttpStatusFromError(error) {
    if (error instanceof ValidationError || error instanceof InvalidDateRangeError) {
        return 400; // Bad Request
    }

    if (error instanceof NotFoundError) {
        return 404; // Not Found
    }

    if (error instanceof BusinessRuleViolationError) {
        return 422; // Unprocessable Entity
    }

    if (error instanceof ApiRequestError) {
        return error.statusCode || 400; // Bad Request
    }

    if (error instanceof ApiResponseError) {
        return error.statusCode || 502; // Bad Gateway
    }

    if (error instanceof RepositoryError) {
        return 500; // Internal Server Error
    }

    if (error.statusCode) {
        return error.statusCode;
    }

    // Otros códigos comunes
    switch (error.name) {
        case 'UnauthorizedError':
            return 401; // Unauthorized
        case 'ForbiddenError':
            return 403; // Forbidden
        case 'NotFoundError':
            return 404; // Not Found
        case 'ConflictError':
            return 409; // Conflict
        default:
            return 500; // Internal Server Error
    }
}

/**
 * Determina un código de error desde el tipo de error
 *
 * @param {Error} error - Error a procesar
 * @returns {string} - Código de error
 */
function getErrorCodeFromType(error) {
    // Usar código existente si está disponible
    if (error.code) return error.code;

    // Determinar por el tipo de error
    switch (error.name) {
        case 'ValidationError':
            return 'VALIDATION_ERROR';
        case 'InvalidDateRangeError':
            return 'INVALID_DATE_RANGE';
        case 'ApiRequestError':
            return 'API_REQUEST_ERROR';
        case 'ApiResponseError':
            return 'API_RESPONSE_ERROR';
        case 'RepositoryError':
            return 'REPOSITORY_ERROR';
        case 'NotFoundError':
            return 'NOT_FOUND';
        case 'BusinessRuleViolationError':
            return 'BUSINESS_RULE_VIOLATION';
        default:
            return 'INTERNAL_ERROR';
    }
}

/**
 * Determina el código de error específico para errores de MongoDB
 *
 * @param {Error} error - Error de MongoDB
 * @returns {string} - Código de error
 */
function determineMongoErrorCode(error) {
    // Códigos de error específicos de MongoDB
    if (error.code) {
        switch (error.code) {
            case 11000:
                return 'DUPLICATE_KEY';
            case 121:
                return 'DOCUMENT_VALIDATION_FAILED';
            default:
                return `MONGO_${error.code}`;
        }
    }

    // Por el nombre del error
    switch (error.name) {
        case 'ValidationError':
            return 'MONGO_VALIDATION_ERROR';
        case 'CastError':
            return 'MONGO_CAST_ERROR';
        case 'MongoServerError':
            return 'MONGO_SERVER_ERROR';
        case 'MongoNetworkError':
            return 'MONGO_NETWORK_ERROR';
        default:
            return 'MONGO_ERROR';
    }
}

module.exports = {
    handleError,
    handleApiError,
    handleDatabaseError,
    handleValidationError,
    handleREEApiError,
    errorMiddleware,
    getHttpStatusFromError,
    getErrorCodeFromType
};
