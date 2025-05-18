
/**
 * @file ElectricBalanceRepository.js
 * @description Interfaz del repositorio para la entidad ElectricBalance
 *
 * Esta interfaz define los métodos que cualquier implementación
 * concreta del repositorio debe proporcionar. Sigue el principio de
 * inversión de dependencias de la Arquitectura Limpia.
 */

/**
 * @interface ElectricBalanceRepository
 */
class ElectricBalanceRepository {
  /**
   * Guarda un nuevo balance eléctrico en el repositorio
   *
   * @param {import('../entities/ElectricBalance')} electricBalance - Entidad ElectricBalance a guardar
   * @returns {Promise<import('../entities/ElectricBalance')>} - ElectricBalance guardado con ID asignado
   * @throws {Error} - Si hay problemas al guardar los datos
   */
  async save(electricBalance) {
    throw new Error('ElectricBalanceRepository.save must be implemented');
  }

  /**
   * Guarda múltiples balances eléctricos en una sola operación
   *
   * @param {Array<import('../entities/ElectricBalance')>} electricBalances - Array de entidades ElectricBalance
   * @returns {Promise<Array<import('../entities/ElectricBalance')>>} - Array de ElectricBalances guardados
   * @throws {Error} - Si hay problemas al guardar los datos
   */
  async saveMany(electricBalances) {
    throw new Error('ElectricBalanceRepository.saveMany must be implemented');
  }

  /**
   * Busca un balance eléctrico por su ID
   *
   * @param {string} id - ID del balance eléctrico a buscar
   * @returns {Promise<import('../entities/ElectricBalance') | null>} - ElectricBalance encontrado o null
   * @throws {Error} - Si hay problemas al buscar los datos
   */
  async findById(id) {
    throw new Error('ElectricBalanceRepository.findById must be implemented');
  }

  /**
   * Busca balances eléctricos por rango de fechas
   *
   * @param {Date} startDate - Fecha de inicio del rango
   * @param {Date} endDate - Fecha de fin del rango
   * @param {string} timeScope - Alcance temporal (day, month, year)
   * @param {Object} options - Opciones adicionales (paginación, ordenación, etc.)
   * @returns {Promise<Array<import('../entities/ElectricBalance')>>} - Array de ElectricBalances
   * @throws {Error} - Si hay problemas al buscar los datos
   */
  async findByDateRange(startDate, endDate, timeScope = 'day', options = {}) {
    throw new Error('ElectricBalanceRepository.findByDateRange must be implemented');
  }

  /**
   * Obtiene estadísticas agregadas de balance eléctrico por rango de fechas
   *
   * @param {Date} startDate - Fecha de inicio del rango
   * @param {Date} endDate - Fecha de fin del rango
   * @param {string} timeScope - Alcance temporal (day, month, year)
   * @returns {Promise<Object>} - Estadísticas agregadas
   * @throws {Error} - Si hay problemas al calcular las estadísticas
   */
  async getStatsByDateRange(startDate, endDate, timeScope = 'day') {
    throw new Error('ElectricBalanceRepository.getStatsByDateRange must be implemented');
  }

  /**
   * Busca el balance eléctrico más reciente
   *
   * @returns {Promise<import('../entities/ElectricBalance') | null>} - ElectricBalance más reciente o null
   * @throws {Error} - Si hay problemas al buscar los datos
   */
  async findMostRecent() {
    throw new Error('ElectricBalanceRepository.findMostRecent must be implemented');
  }

  /**
   * Actualiza un balance eléctrico existente
   *
   * @param {string} id - ID del balance eléctrico a actualizar
   * @param {import('../entities/ElectricBalance')} electricBalance - Datos actualizados
   * @returns {Promise<import('../entities/ElectricBalance')>} - ElectricBalance actualizado
   * @throws {Error} - Si hay problemas al actualizar los datos
   */
  async update(id, electricBalance) {
    throw new Error('ElectricBalanceRepository.update must be implemented');
  }

  /**
   * Elimina un balance eléctrico por su ID
   *
   * @param {string} id - ID del balance eléctrico a eliminar
   * @returns {Promise<boolean>} - true si se eliminó correctamente, false si no existía
   * @throws {Error} - Si hay problemas al eliminar los datos
   */
  async delete(id) {
    throw new Error('ElectricBalanceRepository.delete must be implemented');
  }

  /**
   * Verifica si ya existe un balance eléctrico para una fecha y alcance específicos
   *
   * @param {Date} timestamp - Fecha y hora a verificar
   * @param {string} timeScope - Alcance temporal (day, month, year)
   * @returns {Promise<boolean>} - true si existe, false si no
   * @throws {Error} - Si hay problemas al verificar los datos
   */
  async existsForDateAndScope(timestamp, timeScope) {
    throw new Error('ElectricBalanceRepository.existsForDateAndScope must be implemented');
  }

  /**
   * Obtiene la distribución de generación por tipo para un rango de fechas
   *
   * @param {Date} startDate - Fecha de inicio del rango
   * @param {Date} endDate - Fecha de fin del rango
   * @param {string} timeScope - Alcance temporal (day, month, year)
   * @returns {Promise<Object>} - Distribución de generación por tipo
   * @throws {Error} - Si hay problemas al obtener los datos
   */
  async getGenerationDistribution(startDate, endDate, timeScope = 'day') {
    throw new Error('ElectricBalanceRepository.getGenerationDistribution must be implemented');
  }

  /**
   * Obtiene la evolución temporal de un indicador específico
   *
   * @param {string} indicator - Indicador a obtener (totalGeneration, renewablePercentage, etc.)
   * @param {Date} startDate - Fecha de inicio del rango
   * @param {Date} endDate - Fecha de fin del rango
   * @param {string} timeScope - Alcance temporal (day, month, year)
   * @returns {Promise<Array<Object>>} - Evolución temporal del indicador
   * @throws {Error} - Si hay problemas al obtener los datos
   */
  async getTimeSeriesForIndicator(indicator, startDate, endDate, timeScope = 'day') {
    throw new Error('ElectricBalanceRepository.getTimeSeriesForIndicator must be implemented');
  }
}

module.exports = ElectricBalanceRepository;
