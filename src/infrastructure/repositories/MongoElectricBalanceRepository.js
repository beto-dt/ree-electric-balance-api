/**
 * @file MongoElectricBalanceRepository.js
 * @description Implementación del repositorio de balance eléctrico utilizando MongoDB
 *
 * Este archivo implementa la interfaz ElectricBalanceRepository utilizando
 * MongoDB como almacenamiento, a través del modelo de Mongoose.
 */

const ElectricBalanceRepository = require('../../domain/repositories/ElectricBalanceRepository');
const ElectricBalance = require('../../domain/entities/ElectricBalance');
const ElectricBalanceModel = require('../database/models/ElectricBalanceModel');
const { RepositoryError, NotFoundError } = require('../../application/errors/ApplicationErrors');

/**
 * Implementación del repositorio de balance eléctrico utilizando MongoDB
 * @implements {ElectricBalanceRepository}
 */
class MongoElectricBalanceRepository extends ElectricBalanceRepository {
    /**
     * Constructor del repositorio
     *
     * @param {Object} logger - Instancia del logger para registro de eventos
     */
    constructor(logger = console) {
        super();
        this.logger = logger;

        // Verificar que el modelo está disponible
        const ElectricBalanceModel = require('../database/models/ElectricBalanceModel');
        if (!ElectricBalanceModel) {
            throw new Error('ElectricBalanceModel not available');
        }

        this.model = ElectricBalanceModel;

        this.logger.debug('MongoElectricBalanceRepository initialized with model:',
          this.model ? this.model.modelName : 'undefined');
    }

    /**
     * Guarda un balance eléctrico en la base de datos
     *
     * @param {ElectricBalance} electricBalance - Instancia de ElectricBalance a guardar
     * @returns {Promise<ElectricBalance>} - Balance eléctrico guardado con ID asignado
     * @throws {RepositoryError} - Si hay problemas al guardar los datos
     */
    async save(electricBalance) {
        try {
            // Convertir la entidad de dominio a documento de MongoDB
            const electricBalanceData = this._mapToDocument(electricBalance);

            // Crear nuevo documento en MongoDB
            const savedDocument = await ElectricBalanceModel.create(electricBalanceData);

            // Convertir documento guardado a entidad de dominio
            return this._mapToEntity(savedDocument);
        } catch (error) {
            this.logger.error(`Error saving electric balance: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to save electric balance: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'save'
                }
            );
        }
    }

    /**
     * Guarda múltiples balances eléctricos en una operación
     *
     * @param {Array<ElectricBalance>} electricBalances - Array de entidades a guardar
     * @returns {Promise<Array<ElectricBalance>>} - Array de entidades guardadas con IDs asignados
     * @throws {RepositoryError} - Si hay problemas al guardar los datos
     */
    async saveMany(electricBalances) {
        if (!electricBalances || electricBalances.length === 0) {
            return [];
        }

        try {
            // Verificar que el modelo está disponible
            if (!this.model) {
                this.logger.error('MongoDB model is undefined');
                throw new Error('MongoDB model is undefined');
            }

            // Convertir entidades a documentos
            const documents = electricBalances.map(entity => this._mapToDocument(entity));

            this.logger.debug(`Saving ${documents.length} documents to MongoDB`);

            // Crear documentos uno por uno como alternativa a insertMany
            const savedDocuments = [];
            for (const doc of documents) {
                const savedDoc = await this.model.create(doc);
                savedDocuments.push(savedDoc);
            }

            this.logger.debug(`Successfully saved ${savedDocuments.length} documents`);

            // Convertir documentos guardados a entidades de dominio
            return savedDocuments.map(doc => this._mapToEntity(doc));
        } catch (error) {
            this.logger.error(`Error saving multiple electric balances: ${error.message}`, error);
            throw new Error(`Failed to save multiple electric balances: ${error.message}`);
        }
    }

    /**
     * Busca un balance eléctrico por su ID
     *
     * @param {string} id - ID del balance eléctrico
     * @returns {Promise<ElectricBalance|null>} - Balance eléctrico encontrado o null
     * @throws {RepositoryError} - Si hay problemas al buscar los datos
     */
    async findById(id) {
        try {
            const document = await ElectricBalanceModel.findById(id);

            if (!document) {
                return null;
            }

            return this._mapToEntity(document);
        } catch (error) {
            this.logger.error(`Error finding electric balance by ID: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to find electric balance by ID: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'findById',
                    metadata: { id }
                }
            );
        }
    }

    /**
     * Busca balances eléctricos por rango de fechas
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @param {Object} options - Opciones adicionales (paginación, ordenación, etc.)
     * @returns {Promise<Array<ElectricBalance>>} - Array de balances eléctricos
     * @throws {RepositoryError} - Si hay problemas al buscar los datos
     */
    async findByDateRange(startDate, endDate, timeScope = 'day', options = {}) {
        try {
            // Construir query base
            const query = {
                timestamp: { $gte: startDate, $lte: endDate }
            };

            // Añadir timeScope si se especifica
            if (timeScope) {
                query.timeScope = timeScope;
            }

            // Si solo se necesita un conteo
            if (options.onlyCount) {
                const count = await ElectricBalanceModel.countDocuments(query);
                return { count };
            }

            // Si solo se necesitan IDs
            if (options.onlyIds) {
                const documents = await ElectricBalanceModel.find(query).select('_id');
                return documents.map(doc => doc._id.toString());
            }

            // Opciones de paginación
            const limit = options.limit || 100;
            const skip = options.skip || ((options.page || 1) - 1) * limit;

            // Opciones de ordenación
            const sort = options.sort || { timestamp: 1 };

            // Construir query completa
            let queryBuilder = ElectricBalanceModel.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit);

            // Aplicar selección de campos si se especifica
            if (options.select) {
                queryBuilder = queryBuilder.select(options.select);
            }

            // Aplicar filtros adicionales
            if (options.filters) {
                Object.entries(options.filters).forEach(([key, value]) => {
                    if (key.startsWith('generation.') || key.startsWith('demand.') || key.startsWith('interchange.')) {
                        // Filtros para arrays anidados
                        queryBuilder = queryBuilder.where(key).equals(value);
                    } else {
                        // Filtros normales
                        query[key] = value;
                    }
                });
            }

            // Ejecutar consulta
            const documents = await queryBuilder.exec();

            // Convertir documentos a entidades
            return documents.map(doc => this._mapToEntity(doc));
        } catch (error) {
            this.logger.error(`Error finding electric balances by date range: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to find electric balances by date range: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'findByDateRange',
                    metadata: { startDate, endDate, timeScope }
                }
            );
        }
    }

    /**
     * Obtiene estadísticas agregadas de balance eléctrico por rango de fechas
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @returns {Promise<Object>} - Estadísticas agregadas
     * @throws {RepositoryError} - Si hay problemas al calcular las estadísticas
     */
    async getStatsByDateRange(startDate, endDate, timeScope = 'day') {
        try {
            const stats = await ElectricBalanceModel.getStatsByDateRange(
                startDate,
                endDate,
                timeScope
            );

            if (!stats || stats.length === 0) {
                return {
                    count: 0,
                    stats: null,
                    message: 'No data available for the specified range'
                };
            }

            // Transformar resultado de agregación
            return {
                count: stats[0].count,
                startDate,
                endDate,
                timeScope,
                stats: {
                    generation: {
                        average: stats[0].avgTotalGeneration,
                        max: stats[0].maxTotalGeneration,
                        min: stats[0].minTotalGeneration
                    },
                    demand: {
                        average: stats[0].avgTotalDemand,
                        max: stats[0].maxTotalDemand,
                        min: stats[0].minTotalDemand
                    },
                    renewablePercentage: {
                        average: stats[0].avgRenewablePercentage,
                        max: stats[0].maxRenewablePercentage,
                        min: stats[0].minRenewablePercentage
                    }
                }
            };
        } catch (error) {
            this.logger.error(`Error getting stats by date range: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to get stats by date range: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'getStatsByDateRange',
                    metadata: { startDate, endDate, timeScope }
                }
            );
        }
    }

    /**
     * Busca el balance eléctrico más reciente
     *
     * @returns {Promise<ElectricBalance|null>} - Balance eléctrico más reciente o null
     * @throws {RepositoryError} - Si hay problemas al buscar los datos
     */
    async findMostRecent() {
        try {
            const document = await ElectricBalanceModel.findOne()
                .sort({ timestamp: -1 })
                .limit(1);

            if (!document) {
                return null;
            }

            return this._mapToEntity(document);
        } catch (error) {
            this.logger.error(`Error finding most recent electric balance: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to find most recent electric balance: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'findMostRecent'
                }
            );
        }
    }

    /**
     * Actualiza un balance eléctrico existente
     *
     * @param {string} id - ID del balance eléctrico
     * @param {ElectricBalance} electricBalance - Datos actualizados
     * @returns {Promise<ElectricBalance>} - Balance eléctrico actualizado
     * @throws {NotFoundError} - Si el balance no existe
     * @throws {RepositoryError} - Si hay problemas al actualizar
     */
    async update(id, electricBalance) {
        try {
            // Verificar que existe
            const exists = await ElectricBalanceModel.exists({ _id: id });

            if (!exists) {
                throw new NotFoundError(
                    `Electric balance with ID ${id} not found`,
                    { resourceType: 'ElectricBalance', resourceId: id }
                );
            }

            // Convertir entidad a documento
            const electricBalanceData = this._mapToDocument(electricBalance);

            // Actualizar documento
            const updatedDocument = await ElectricBalanceModel.findByIdAndUpdate(
                id,
                electricBalanceData,
                { new: true, runValidators: true } // Devolver el documento actualizado y validar
            );

            return this._mapToEntity(updatedDocument);
        } catch (error) {
            // Reenviar errores de NotFound
            if (error instanceof NotFoundError) {
                throw error;
            }

            this.logger.error(`Error updating electric balance: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to update electric balance: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'update',
                    metadata: { id }
                }
            );
        }
    }

    /**
     * Elimina un balance eléctrico por su ID
     *
     * @param {string} id - ID del balance a eliminar
     * @returns {Promise<boolean>} - true si se eliminó, false si no existía
     * @throws {RepositoryError} - Si hay problemas al eliminar
     */
    async delete(id) {
        try {
            const result = await ElectricBalanceModel.deleteOne({ _id: id });

            return result.deletedCount > 0;
        } catch (error) {
            this.logger.error(`Error deleting electric balance: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to delete electric balance: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'delete',
                    metadata: { id }
                }
            );
        }
    }

    /**
     * Verifica si ya existe un balance eléctrico para una fecha y alcance específicos
     *
     * @param {Date} timestamp - Fecha y hora a verificar
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @returns {Promise<boolean>} - true si existe, false si no
     * @throws {RepositoryError} - Si hay problemas al verificar
     */
    async existsForDateAndScope(timestamp, timeScope) {
        try {
            // Crear rango de fechas para el mismo día
            const startOfDay = new Date(timestamp);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(timestamp);
            endOfDay.setHours(23, 59, 59, 999);

            // Buscar con rango para mayor tolerancia
            const exists = await ElectricBalanceModel.exists({
                timestamp: { $gte: startOfDay, $lte: endOfDay },
                timeScope
            });

            return exists !== null;
        } catch (error) {
            this.logger.error(`Error checking if electric balance exists: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to check if electric balance exists: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'existsForDateAndScope',
                    metadata: { timestamp, timeScope }
                }
            );
        }
    }

    /**
     * Obtiene la distribución de generación por tipo para un rango de fechas
     *
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @returns {Promise<Object>} - Distribución de generación por tipo
     * @throws {RepositoryError} - Si hay problemas al obtener los datos
     */
    async getGenerationDistribution(startDate, endDate, timeScope = 'day') {
        try {
            const distribution = await ElectricBalanceModel.getGenerationDistribution(
                startDate,
                endDate,
                timeScope
            );

            // Calcular el total para porcentajes
            const totalGeneration = distribution.reduce(
                (sum, item) => sum + item.totalValue, 0
            );

            // Añadir porcentajes respecto al total
            return distribution.map(item => ({
                ...item,
                percentage: totalGeneration > 0
                    ? (item.totalValue / totalGeneration) * 100
                    : 0
            }));
        } catch (error) {
            this.logger.error(`Error getting generation distribution: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to get generation distribution: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'getGenerationDistribution',
                    metadata: { startDate, endDate, timeScope }
                }
            );
        }
    }

    /**
     * Obtiene la evolución temporal de un indicador específico
     *
     * @param {string} indicator - Indicador a obtener (totalGeneration, renewablePercentage, etc.)
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @returns {Promise<Array<Object>>} - Evolución temporal del indicador
     * @throws {RepositoryError} - Si hay problemas al obtener los datos
     */
    async getTimeSeriesForIndicator(indicator, startDate, endDate, timeScope = 'day') {
        try {
            return ElectricBalanceModel.getTimeSeriesForIndicator(
                indicator,
                startDate,
                endDate,
                timeScope
            );
        } catch (error) {
            this.logger.error(`Error getting time series for indicator: ${error.message}`, error);

            throw new RepositoryError(
                `Failed to get time series for indicator: ${error.message}`,
                {
                    originalError: error,
                    entity: 'ElectricBalance',
                    operation: 'getTimeSeriesForIndicator',
                    metadata: { indicator, startDate, endDate, timeScope }
                }
            );
        }
    }

    /**
     * Convierte una entidad de dominio a documento de MongoDB
     *
     * @param {ElectricBalance} entity - Entidad a convertir
     * @returns {Object} - Documento listo para MongoDB
     * @private
     */
    _mapToDocument(entity) {
        // Verificar y corregir valores NaN o no válidos
        const totalGeneration = Number.isFinite(entity.getTotalGeneration())
          ? entity.getTotalGeneration()
          : 0;

        const totalDemand = Number.isFinite(entity.getTotalDemand())
          ? entity.getTotalDemand()
          : 0;

        const balance = Number.isFinite(entity.getBalance())
          ? entity.getBalance()
          : 0;

        const renewablePercentage = Number.isFinite(entity.getRenewablePercentage())
          ? entity.getRenewablePercentage()
          : 0;

        // Crear documento para MongoDB con valores seguros
        const document = {
            ...(entity.id ? { _id: entity.id } : {}),
            timestamp: entity.timestamp,
            timeScope: entity.timeScope,
            generation: entity.generation || [],
            demand: entity.demand || [],
            interchange: entity.interchange || [],
            totalGeneration,
            totalDemand,
            balance,
            renewablePercentage,
            metadata: entity.metadata || {}
        };

        return document;
    }

    /**
     * Convierte un documento de MongoDB a entidad de dominio
     *
     * @param {Object} document - Documento de MongoDB
     * @returns {ElectricBalance} - Entidad de dominio
     * @private
     */
    _mapToEntity(document) {
        if (!document) return null;

        // Usar toObject() para obtener un objeto plano si es un documento de Mongoose
        const docObj = document.toObject ? document.toObject() : document;

        // Crear la entidad con los datos del documento
        const entity = new ElectricBalance({
            id: docObj._id.toString(),
            timestamp: docObj.timestamp,
            timeScope: docObj.timeScope,
            generation: docObj.generation,
            demand: docObj.demand,
            interchange: docObj.interchange,
            metadata: docObj.metadata || {},
            createdAt: docObj.createdAt,
            updatedAt: docObj.updatedAt
        });

        return entity;
    }
}

module.exports = MongoElectricBalanceRepository;
