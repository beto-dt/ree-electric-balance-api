/**
 * @file ApplicationErrors.js
 * @description Definición de errores personalizados para la capa de aplicación
 *
 * Este archivo contiene las clases de errores específicos que pueden ocurrir
 * durante la ejecución de los casos de uso. Permiten un manejo más granular
 * de diferentes situaciones de error.
 */

/**
 * Error base para todos los errores de la aplicación
 * Extiende el Error nativo de JavaScript
 */
class ApplicationError extends Error {
    /**
     * Constructor del error base
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {Error} [options.originalError] - Error original que causó este error
     * @param {Object} [options.metadata] - Metadatos adicionales sobre el error
     */
    constructor(message, options = {}) {
        super(message);
        this.name = this.constructor.name;
        this.originalError = options.originalError;
        this.metadata = options.metadata || {};
        this.timestamp = new Date();

        Error.captureStackTrace(this, this.constructor);

        if (this.originalError && this.originalError.stack) {
            this.stack += '\nCaused by: ' + this.originalError.stack;
        }
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            timestamp: this.timestamp,
            metadata: this.metadata,
            originalError: this.originalError ? {
                name: this.originalError.name,
                message: this.originalError.message
            } : undefined
        };
    }
}

/**
 * Error para problemas con los datos de entrada
 */
class ValidationError extends ApplicationError {
    /**
     * Constructor del error de validación
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {Object} [options.validationErrors] - Detalles de los errores de validación
     */
    constructor(message, options = {}) {
        super(message, options);
        this.validationErrors = options.validationErrors || {};
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            validationErrors: this.validationErrors
        };
    }
}

/**
 * Error para datos de entrada inválidos
 */
class InvalidDataError extends ValidationError {
    constructor(message, options = {}) {
        super(message, options);
    }
}

/**
 * Error para rangos de fechas inválidos
 */
class InvalidDateRangeError extends ValidationError {
    constructor(message, options = {}) {
        super(message, options);
    }
}

/**
 * Error para datos duplicados
 */
class DuplicateDataError extends ValidationError {
    constructor(message, options = {}) {
        super(message, options);
    }
}

/**
 * Error base para problemas con recursos externos
 */
class ExternalResourceError extends ApplicationError {
    /**
     * Constructor del error de recursos externos
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {string} [options.resource] - Recurso que causó el error
     * @param {string} [options.action] - Acción que se intentaba realizar
     */
    constructor(message, options = {}) {
        super(message, options);
        this.resource = options.resource;
        this.action = options.action;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            resource: this.resource,
            action: this.action
        };
    }
}

/**
 * Error para problemas con peticiones a APIs
 */
class ApiRequestError extends ExternalResourceError {
    /**
     * Constructor del error de petición a API
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {string} [options.endpoint] - Endpoint de la API
     * @param {Object} [options.requestParams] - Parámetros de la petición
     * @param {number} [options.statusCode] - Código de estado HTTP
     */
    constructor(message, options = {}) {
        super(message, {
            ...options,
            resource: options.endpoint || 'API',
            action: 'request'
        });
        this.endpoint = options.endpoint;
        this.requestParams = options.requestParams;
        this.statusCode = options.statusCode;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            endpoint: this.endpoint,
            statusCode: this.statusCode,
            requestParams: this.requestParams
        };
    }
}

/**
 * Error para respuestas incorrectas de APIs
 */
class ApiResponseError extends ExternalResourceError {
    /**
     * Constructor del error de respuesta de API
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {string} [options.endpoint] - Endpoint de la API
     * @param {Object} [options.response] - Respuesta recibida
     * @param {number} [options.statusCode] - Código de estado HTTP
     */
    constructor(message, options = {}) {
        super(message, {
            ...options,
            resource: options.endpoint || 'API',
            action: 'response'
        });
        this.endpoint = options.endpoint;
        this.response = options.response;
        this.statusCode = options.statusCode;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            endpoint: this.endpoint,
            statusCode: this.statusCode,
            hasResponse: this.response !== undefined
        };
    }
}

/**
 * Error para problemas con los repositorios
 */
class RepositoryError extends ExternalResourceError {
    /**
     * Constructor del error de repositorio
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {string} [options.entity] - Entidad afectada
     * @param {string} [options.operation] - Operación que falló
     */
    constructor(message, options = {}) {
        super(message, {
            ...options,
            resource: options.entity || 'Repository',
            action: options.operation || 'database operation'
        });
        this.entity = options.entity;
        this.operation = options.operation;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            entity: this.entity,
            operation: this.operation
        };
    }
}

/**
 * Error para operaciones no autorizadas
 */
class NotAuthorizedError extends ApplicationError {
    /**
     * Constructor del error de no autorizado
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {string} [options.requiredPermission] - Permiso requerido
     * @param {string} [options.userId] - ID del usuario
     */
    constructor(message, options = {}) {
        super(message || 'Operation not authorized', options);
        this.requiredPermission = options.requiredPermission;
        this.userId = options.userId;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            requiredPermission: this.requiredPermission,
            userId: this.userId
        };
    }
}

/**
 * Error para recursos no encontrados
 */
class NotFoundError extends ApplicationError {
    /**
     * Constructor del error de no encontrado
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {string} [options.resourceType] - Tipo de recurso
     * @param {string|number} [options.resourceId] - ID del recurso
     */
    constructor(message, options = {}) {
        const defaultMessage = options.resourceType && options.resourceId
            ? `${options.resourceType} with id ${options.resourceId} not found`
            : 'Resource not found';

        super(message || defaultMessage, options);
        this.resourceType = options.resourceType;
        this.resourceId = options.resourceId;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            resourceType: this.resourceType,
            resourceId: this.resourceId
        };
    }
}

/**
 * Error para operaciones de negocio inválidas
 */
class BusinessRuleViolationError extends ApplicationError {
    /**
     * Constructor del error de violación de regla de negocio
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {string} [options.rule] - Regla violada
     */
    constructor(message, options = {}) {
        super(message, options);
        this.rule = options.rule;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            rule: this.rule
        };
    }
}

/**
 * Error para configuración incorrecta
 */
class ConfigurationError extends ApplicationError {
    /**
     * Constructor del error de configuración
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {string} [options.configKey] - Clave de configuración
     */
    constructor(message, options = {}) {
        super(message, options);
        this.configKey = options.configKey;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            configKey: this.configKey
        };
    }
}

/**
 * Error para problemas de red o conectividad
 */
class NetworkError extends ExternalResourceError {
    /**
     * Constructor del error de red
     *
     * @param {string} message - Mensaje descriptivo del error
     * @param {Object} [options={}] - Opciones adicionales
     * @param {boolean} [options.isTimeout] - Si es un error de timeout
     * @param {number} [options.retryAttempt] - Número de intento de reintento
     */
    constructor(message, options = {}) {
        super(message, {
            ...options,
            resource: options.resource || 'Network',
            action: options.action || 'connection'
        });
        this.isTimeout = options.isTimeout || false;
        this.retryAttempt = options.retryAttempt;
    }

    /**
     * Convierte el error a un objeto simple para logging o serialización
     *
     * @returns {Object} - Representación del error
     */
    toJSON() {
        return {
            ...super.toJSON(),
            isTimeout: this.isTimeout,
            retryAttempt: this.retryAttempt
        };
    }
}

module.exports = {
    ApplicationError,
    ValidationError,
    InvalidDataError,
    InvalidDateRangeError,
    DuplicateDataError,
    ExternalResourceError,
    ApiRequestError,
    ApiResponseError,
    RepositoryError,
    NotAuthorizedError,
    NotFoundError,
    BusinessRuleViolationError,
    ConfigurationError,
    NetworkError
};
