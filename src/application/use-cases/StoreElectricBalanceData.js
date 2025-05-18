/**
 * @file StoreElectricBalanceData.js
 * @description Caso de uso para almacenar datos de balance eléctrico
 *
 * Este caso de uso maneja la lógica para almacenar, actualizar y gestionar
 * datos de balance eléctrico en el repositorio.
 */

const ElectricBalance = require('../../domain/entities/ElectricBalance');
const {
    InvalidDataError,
    RepositoryError,
    DuplicateDataError
} = require('../errors/ApplicationErrors');

/**
 * Clase que implementa el caso de uso para almacenar datos de balance eléctrico
 */
class StoreElectricBalanceData {
    /**
     * Constructor del caso de uso
     *
     * @param {import('../../domain/repositories/ElectricBalanceRepository')} electricBalanceRepository - Repositorio de balance eléctrico
     * @param {Object} logger - Logger para registrar eventos y errores
     */
    constructor(electricBalanceRepository, logger) {
        this.electricBalanceRepository = electricBalanceRepository;
        this.logger = logger || console;
    }

    /**
     * Ejecuta el caso de uso para almacenar un único balance eléctrico
     *
     * @param {Object} params - Parámetros del caso de uso
     * @param {Object|import('../../domain/entities/ElectricBalance')} params.data - Datos del balance eléctrico
     * @param {boolean} [params.skipDuplicateCheck=false] - Omitir verificación de duplicados
     * @param {boolean} [params.overwrite=false] - Sobrescribir datos existentes
     * @returns {Promise<import('../../domain/entities/ElectricBalance')>} - Balance eléctrico almacenado
     * @throws {InvalidDataError} - Si los datos son inválidos
     * @throws {DuplicateDataError} - Si los datos ya existen y no se debe sobrescribir
     * @throws {RepositoryError} - Si hay problemas con el repositorio
     */
    async executeSingle({ data, skipDuplicateCheck = false, overwrite = false }) {
        try {
            // Verificar y convertir a entidad ElectricBalance si es necesario
            const electricBalance = this._ensureElectricBalanceEntity(data);

            // Verificar si es un duplicado, a menos que se omita esta verificación
            if (!skipDuplicateCheck) {
                const isDuplicate = await this._checkForDuplicate(electricBalance);

                if (isDuplicate && !overwrite) {
                    throw new DuplicateDataError(
                        `Data already exists for timestamp ${electricBalance.timestamp.toISOString()} and scope ${electricBalance.timeScope}`
                    );
                }
            }

            // Almacenar o actualizar el balance eléctrico
            let savedBalance;
            if (!skipDuplicateCheck && overwrite) {
                // Buscar ID del registro existente para actualizarlo
                const existingBalance = await this._findExistingBalance(electricBalance);

                if (existingBalance) {
                    // Actualizar registro existente preservando su ID
                    electricBalance.id = existingBalance.id;
                    savedBalance = await this.electricBalanceRepository.update(existingBalance.id, electricBalance);
                    this.logger.info(`Updated electric balance for ${electricBalance.timestamp.toISOString()}`);
                } else {
                    // No existe, creamos uno nuevo
                    savedBalance = await this.electricBalanceRepository.save(electricBalance);
                    this.logger.info(`Created new electric balance for ${electricBalance.timestamp.toISOString()}`);
                }
            } else {
                // Crear nuevo registro
                savedBalance = await this.electricBalanceRepository.save(electricBalance);
                this.logger.info(`Stored electric balance for ${electricBalance.timestamp.toISOString()}`);
            }

            return savedBalance;

        } catch (error) {
            // Reenviar errores específicos
            if (error instanceof InvalidDataError ||
                error instanceof DuplicateDataError) {
                throw error;
            }

            // Para otros errores, crear un RepositoryError
            throw new RepositoryError(
                `Failed to store electric balance data: ${error.message}`,
                { originalError: error }
            );
        }
    }

    /**
     * Ejecuta el caso de uso para almacenar múltiples balances eléctricos
     *
     * @param {Object} params - Parámetros del caso de uso
     * @param {Array<Object|import('../../domain/entities/ElectricBalance')>} params.dataArray - Array de datos de balance eléctrico
     * @param {boolean} [params.skipDuplicateCheck=false] - Omitir verificación de duplicados
     * @param {boolean} [params.overwrite=false] - Sobrescribir datos existentes
     * @param {boolean} [params.atomicOperation=true] - Realizar operación atómica (todo o nada)
     * @returns {Promise<Object>} - Resultado de la operación
     * @throws {InvalidDataError} - Si los datos son inválidos
     * @throws {RepositoryError} - Si hay problemas con el repositorio
     */
    async executeMultiple({
                              dataArray,
                              skipDuplicateCheck = false,
                              overwrite = false,
                              atomicOperation = true
                          }) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            throw new InvalidDataError('Data array is empty or not an array');
        }

        this.logger.info(`Storing ${dataArray.length} electric balance records`);

        try {
            // Convertir todos los datos a entidades ElectricBalance
            const electricBalances = dataArray.map(data => this._ensureElectricBalanceEntity(data));

            // Si no verificamos duplicados o no sobrescribimos, uso saveMany para mejor rendimiento
            if (skipDuplicateCheck || !overwrite) {
                if (skipDuplicateCheck) {
                    // Guardar todos sin verificar duplicados
                    const savedBalances = await this.electricBalanceRepository.saveMany(electricBalances);
                    return {
                        success: true,
                        message: `Successfully stored ${savedBalances.length} electric balance records`,
                        savedCount: savedBalances.length,
                        duplicateCount: 0,
                        failedCount: 0
                    };
                } else {
                    // Filtrar duplicados antes de guardar
                    const newBalances = [];
                    const duplicates = [];

                    for (const balance of electricBalances) {
                        const exists = await this.electricBalanceRepository.existsForDateAndScope(
                            balance.timestamp,
                            balance.timeScope
                        );

                        if (exists) {
                            duplicates.push(balance);
                        } else {
                            newBalances.push(balance);
                        }
                    }

                    if (newBalances.length > 0) {
                        await this.electricBalanceRepository.saveMany(newBalances);
                    }

                    return {
                        success: true,
                        message: `Stored ${newBalances.length} new records, found ${duplicates.length} duplicates`,
                        savedCount: newBalances.length,
                        duplicateCount: duplicates.length,
                        failedCount: 0
                    };
                }
            } else {
                // Modo con sobrescritura - procesamos uno por uno para actualizar existentes
                const results = {
                    created: 0,
                    updated: 0,
                    failed: 0,
                    details: []
                };

                // Usar transacción si la operación es atómica
                if (atomicOperation) {
                    // Procesamiento uno por uno pero en una sola transacción
                    const processedBalances = [];

                    for (const balance of electricBalances) {
                        const existingBalance = await this._findExistingBalance(balance);

                        if (existingBalance) {
                            // Actualizar existente
                            balance.id = existingBalance.id;
                            processedBalances.push({
                                balance,
                                operation: 'update',
                                id: existingBalance.id
                            });
                            results.updated++;
                        } else {
                            // Crear nuevo
                            processedBalances.push({
                                balance,
                                operation: 'create'
                            });
                            results.created++;
                        }
                    }

                    // Ejecutar todas las operaciones en una transacción
                    await this._executeInTransaction(processedBalances);

                } else {
                    // Procesamiento individual, sin transacción
                    for (let i = 0; i < electricBalances.length; i++) {
                        const balance = electricBalances[i];

                        try {
                            // Buscar si existe para este timestamp y scope
                            const existingBalance = await this._findExistingBalance(balance);

                            if (existingBalance) {
                                // Actualizar existente
                                balance.id = existingBalance.id;
                                await this.electricBalanceRepository.update(existingBalance.id, balance);
                                results.updated++;
                                results.details.push({
                                    index: i,
                                    status: 'updated',
                                    timestamp: balance.timestamp
                                });
                            } else {
                                // Crear nuevo
                                await this.electricBalanceRepository.save(balance);
                                results.created++;
                                results.details.push({
                                    index: i,
                                    status: 'created',
                                    timestamp: balance.timestamp
                                });
                            }
                        } catch (error) {
                            results.failed++;
                            results.details.push({
                                index: i,
                                status: 'failed',
                                timestamp: balance.timestamp,
                                error: error.message
                            });

                            this.logger.error(`Failed to process record ${i}: ${error.message}`);
                        }
                    }
                }

                return {
                    success: results.failed === 0,
                    message: `Created ${results.created} new records, updated ${results.updated} existing records, failed ${results.failed} records`,
                    createdCount: results.created,
                    updatedCount: results.updated,
                    failedCount: results.failed,
                    details: results.details
                };
            }
        } catch (error) {
            this.logger.error(`Failed to store multiple electric balance records: ${error.message}`);

            throw new RepositoryError(
                `Failed to store multiple electric balance records: ${error.message}`,
                { originalError: error }
            );
        }
    }

    /**
     * Elimina datos de balance eléctrico para un rango de fechas
     *
     * @param {Object} params - Parámetros del caso de uso
     * @param {Date|string} params.startDate - Fecha de inicio
     * @param {Date|string} params.endDate - Fecha de fin
     * @param {string} [params.timeScope] - Granularidad temporal (opcional)
     * @returns {Promise<Object>} - Resultado de la operación
     * @throws {InvalidDataError} - Si las fechas son inválidas
     * @throws {RepositoryError} - Si hay problemas con el repositorio
     */
    async deleteForDateRange({ startDate, endDate, timeScope }) {
        try {
            // Parsear fechas si son strings
            const parsedStartDate = startDate instanceof Date ? startDate : new Date(startDate);
            const parsedEndDate = endDate instanceof Date ? endDate : new Date(endDate);

            // Validar fechas
            if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
                throw new InvalidDataError('Invalid date format');
            }

            if (parsedStartDate > parsedEndDate) {
                throw new InvalidDataError('Start date must be before end date');
            }

            // Obtener registros que se eliminarán
            const recordsToDelete = await this.electricBalanceRepository.findByDateRange(
                parsedStartDate,
                parsedEndDate,
                timeScope,
                { onlyIds: true }
            );

            if (recordsToDelete.length === 0) {
                return {
                    success: true,
                    message: 'No records found for the specified date range',
                    deletedCount: 0
                };
            }

            // Eliminar registros
            const deleteResult = await this._deleteRecords(recordsToDelete);

            return {
                success: true,
                message: `Successfully deleted ${deleteResult.deletedCount} records`,
                deletedCount: deleteResult.deletedCount,
                affectedDates: {
                    startDate: parsedStartDate,
                    endDate: parsedEndDate,
                    timeScope
                }
            };

        } catch (error) {
            if (error instanceof InvalidDataError) {
                throw error;
            }

            throw new RepositoryError(
                `Failed to delete electric balance data: ${error.message}`,
                { originalError: error }
            );
        }
    }

    /**
     * Asegura que los datos sean una entidad ElectricBalance
     *
     * @param {Object|import('../../domain/entities/ElectricBalance')} data - Datos a verificar
     * @returns {import('../../domain/entities/ElectricBalance')} - Entidad ElectricBalance
     * @throws {InvalidDataError} - Si los datos son inválidos
     * @private
     */
    _ensureElectricBalanceEntity(data) {
        if (data instanceof ElectricBalance) {
            return data;
        }

        try {
            // Si es un objeto, intentar crear una entidad
            if (typeof data === 'object' && data !== null) {
                return new ElectricBalance(data);
            }

            throw new InvalidDataError('Invalid data format for electric balance');
        } catch (error) {
            throw new InvalidDataError(
                `Failed to create ElectricBalance entity: ${error.message}`,
                { originalError: error }
            );
        }
    }

    /**
     * Verifica si ya existe un balance eléctrico con el mismo timestamp y scope
     *
     * @param {import('../../domain/entities/ElectricBalance')} electricBalance - Balance a verificar
     * @returns {Promise<boolean>} - true si ya existe, false si no
     * @private
     */
    async _checkForDuplicate(electricBalance) {
        return this.electricBalanceRepository.existsForDateAndScope(
            electricBalance.timestamp,
            electricBalance.timeScope
        );
    }

    /**
     * Busca un balance eléctrico existente por timestamp y scope
     *
     * @param {import('../../domain/entities/ElectricBalance')} electricBalance - Balance a buscar
     * @returns {Promise<import('../../domain/entities/ElectricBalance')|null>} - Balance existente o null
     * @private
     */
    async _findExistingBalance(electricBalance) {
        const existingBalances = await this.electricBalanceRepository.findByDateRange(
            electricBalance.timestamp,
            electricBalance.timestamp,
            electricBalance.timeScope
        );

        return existingBalances.length > 0 ? existingBalances[0] : null;
    }

    /**
     * Ejecuta operaciones múltiples en una transacción
     *
     * @param {Array<Object>} operations - Operaciones a ejecutar
     * @returns {Promise<void>}
     * @private
     */
    async _executeInTransaction(operations) {
        // Este método es una abstracción que permitiría implementar
        // transacciones reales. Para simplificar, procesamos las operaciones
        // de forma secuencial.

        for (const op of operations) {
            if (op.operation === 'update') {
                await this.electricBalanceRepository.update(op.id, op.balance);
            } else {
                await this.electricBalanceRepository.save(op.balance);
            }
        }
    }

    /**
     * Elimina registros por sus IDs
     *
     * @param {Array<string>} recordIds - IDs de los registros a eliminar
     * @returns {Promise<Object>} - Resultado de la eliminación
     * @private
     */
    async _deleteRecords(recordIds) {
        let deletedCount = 0;

        // Implementación simple - en un caso real podría ser una operación en lote
        for (const id of recordIds) {
            const result = await this.electricBalanceRepository.delete(id);
            if (result) {
                deletedCount++;
            }
        }

        return { deletedCount };
    }
}

module.exports = StoreElectricBalanceData;
