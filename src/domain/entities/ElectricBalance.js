/**
 * @file ElectricBalance.js
 * @description Entidad de dominio que representa el balance eléctrico
 */

class ElectricBalance {
    /**
     * Crea una nueva instancia de ElectricBalance
     *
     * @param {Object} params - Parámetros para crear la entidad
     * @param {string} params.id - Identificador único del balance eléctrico
     * @param {Date} params.timestamp - Fecha y hora a la que corresponden los datos
     * @param {string} params.timeScope - Alcance temporal de los datos (day, month, year)
     * @param {Array} params.generation - Datos de generación eléctrica por tipo
     * @param {Array} params.demand - Datos de demanda eléctrica
     * @param {Array} params.interchange - Datos de intercambios internacionales
     * @param {Date} params.createdAt - Fecha de creación del registro
     * @param {Date} params.updatedAt - Fecha de última actualización del registro
     * @param {Object} params.metadata - Metadatos adicionales
     */
    constructor({
                    id = null,
                    timestamp,
                    timeScope = 'day',
                    generation = [],
                    demand = [],
                    interchange = [],
                    createdAt = new Date(),
                    updatedAt = new Date(),
                    metadata = {}
                }) {
        this.id = id;
        this.timestamp = new Date(timestamp);
        this.timeScope = timeScope;
        this.generation = this._processGenerationData(generation);
        this.demand = this._processDemandData(demand);
        this.interchange = this._processInterchangeData(interchange);
        this.createdAt = new Date(createdAt);
        this.updatedAt = new Date(updatedAt);
        this.metadata = metadata;
    }

    /**
     * Procesa los datos de generación para asegurar el formato correcto
     *
     * @param {Array} generationData - Datos de generación por tipo
     * @returns {Array} - Datos de generación procesados
     * @private
     */
    _processGenerationData(generationData) {
        return generationData.map(item => ({
            type: item.type || item.value || '',
            value: parseFloat(item.value || item.percentage || 0),
            percentage: parseFloat(item.percentage || 0),
            color: item.color || null,
            unit: item.attributes?.title || 'MW'
        }));
    }

    /**
     * Procesa los datos de demanda para asegurar el formato correcto
     *
     * @param {Array} demandData - Datos de demanda
     * @returns {Array} - Datos de demanda procesados
     * @private
     */
    _processDemandData(demandData) {
        return demandData.map(item => ({
            type: item.type || item.value || '',
            value: parseFloat(item.value || 0),
            percentage: parseFloat(item.percentage || 0),
            color: item.color || null,
            unit: item.attributes?.title || 'MW'
        }));
    }

    /**
     * Procesa los datos de intercambio para asegurar el formato correcto
     *
     * @param {Array} interchangeData - Datos de intercambio internacional
     * @returns {Array} - Datos de intercambio procesados
     * @private
     */
    _processInterchangeData(interchangeData) {
        return interchangeData.map(item => ({
            type: item.type || item.value || '',
            value: parseFloat(item.value || 0),
            percentage: parseFloat(item.percentage || 0),
            color: item.color || null,
            unit: item.attributes?.title || 'MW'
        }));
    }

    /**
     * Calcula el total de generación eléctrica
     *
     * @returns {number} - Total de generación en MW
     */
    getTotalGeneration() {
        if (!this.generation || !Array.isArray(this.generation) || this.generation.length === 0) {
            return 0;
        }

        const total = this.generation.reduce((total, item) => {
            const value = item && item.value !== undefined ?
              (Number.isFinite(parseFloat(item.value)) ? parseFloat(item.value) : 0)
              : 0;
            return total + value;
        }, 0);

        return Number.isFinite(total) ? total : 0;
    }

    /**
     * Calcula el total de demanda eléctrica
     *
     * @returns {number} - Total de demanda en MW
     */
    getTotalDemand() {
        const total = this.demand.reduce((total, item) => {
            const value = Number.isFinite(item.value) ? item.value : 0;
            return total + value;
        }, 0);

        return Number.isFinite(total) ? total : 0;
    }

    /**
     * Calcula el balance entre generación y demanda
     *
     * @returns {number} - Balance entre generación y demanda
     */
    getBalance() {
        const balance = this.getTotalGeneration() - this.getTotalDemand();
        return Number.isFinite(balance) ? balance : 0;
    }

    /**
     * Calcula el porcentaje de generación renovable
     *
     * @returns {number} - Porcentaje de generación renovable
     */
    getRenewablePercentage() {
        const renewableTypes = [
            'Hidráulica', 'Eólica', 'Solar fotovoltaica', 'Solar térmica',
            'Otras renovables', 'Hidroeólica'
        ];

        const renewableGeneration = this.generation
          .filter(item => renewableTypes.includes(item.type))
          .reduce((total, item) => {
              const value = Number.isFinite(item.value) ? item.value : 0;
              return total + value;
          }, 0);

        const totalGeneration = this.getTotalGeneration();

        if (totalGeneration > 0) {
            const percentage = (renewableGeneration / totalGeneration) * 100;
            return Number.isFinite(percentage) ? percentage : 0;
        }

        return 0;
    }

    /**
     * Obtiene los datos en formato plano para almacenamiento o transferencia
     *
     * @returns {Object} - Objeto plano con los datos del balance eléctrico
     */
    toJSON() {
        return {
            id: this.id,
            timestamp: this.timestamp,
            timeScope: this.timeScope,
            generation: this.generation,
            demand: this.demand,
            interchange: this.interchange,
            totalGeneration: this.getTotalGeneration(),
            totalDemand: this.getTotalDemand(),
            balance: this.getBalance(),
            renewablePercentage: this.getRenewablePercentage(),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata
        };
    }


    /**
     * Crea una instancia de ElectricBalance a partir de la respuesta de la API de REE
     *
     * @param {Object} apiResponse - Respuesta de la API de REE
     * @returns {ElectricBalance} - Nueva instancia de ElectricBalance
     */
    static fromREEApiResponse(apiResponse) {
        if (!apiResponse || !apiResponse.data) {
            throw new Error('Invalid API response format');
        }

        const { data, included } = apiResponse;

        let timestamp;
        if (data.attributes?.datetime) {
            timestamp = data.attributes.datetime;
        } else if (data.attributes?.['last-update']) {
            timestamp = data.attributes['last-update'];
        } else if (data.attributes?.date) {
            timestamp = data.attributes.date;
        } else {
            timestamp = new Date().toISOString();
        }

        const timeScope = data.attributes?.['time-trunc'] || 'day';

        const generation = [];
        const demand = [];
        const interchange = [];

        if (included && Array.isArray(included)) {
            const generationTypes = ['Renovable', 'No-Renovable'];
            const demandTypes = ['Demanda'];
            const interchangeTypes = ['Intercambios Internacionales'];
            const storageTypes = ['Almacenamiento'];

            for (const item of included) {
                if (!item.type || !item.attributes || !item.attributes.content) {
                    continue;
                }

                if (generationTypes.includes(item.type)) {
                    for (const contentItem of item.attributes.content) {
                        if (!contentItem || !contentItem.type) continue;

                        let value = 0;
                        let percentage = 0;

                        if (contentItem.attributes && contentItem.attributes.values && contentItem.attributes.values.length > 0) {
                            const valueObj = contentItem.attributes.values[0];
                            value = parseFloat(valueObj.value || 0);
                            percentage = parseFloat(valueObj.percentage || 0);
                        } else if (contentItem.value !== undefined) {
                            value = parseFloat(contentItem.value || 0);
                            percentage = parseFloat(contentItem.percentage || 0);
                        }

                        const color = contentItem.attributes?.color || contentItem.color || null;

                        generation.push({
                            type: contentItem.type,
                            value: value,
                            percentage: percentage,
                            color: color,
                            unit: 'MW'
                        });
                    }
                }
                else if (demandTypes.includes(item.type)) {
                    for (const contentItem of item.attributes.content) {
                        if (!contentItem || !contentItem.type) continue;

                        let value = 0;
                        let percentage = 0;

                        if (contentItem.attributes && contentItem.attributes.values && contentItem.attributes.values.length > 0) {
                            const valueObj = contentItem.attributes.values[0];
                            value = parseFloat(valueObj.value || 0);
                            percentage = parseFloat(valueObj.percentage || 0);
                        } else if (contentItem.value !== undefined) {
                            value = parseFloat(contentItem.value || 0);
                            percentage = parseFloat(contentItem.percentage || 0);
                        }

                        const color = contentItem.attributes?.color || contentItem.color || null;

                        demand.push({
                            type: contentItem.type,
                            value: value,
                            percentage: percentage,
                            color: color,
                            unit: 'MW'
                        });
                    }
                }
                else if (interchangeTypes.includes(item.type)) {
                    for (const contentItem of item.attributes.content) {
                        if (!contentItem || !contentItem.type) continue;

                        let value = 0;
                        let percentage = 0;

                        if (contentItem.attributes && contentItem.attributes.values && contentItem.attributes.values.length > 0) {
                            const valueObj = contentItem.attributes.values[0];
                            value = parseFloat(valueObj.value || 0);
                            percentage = parseFloat(valueObj.percentage || 0);
                        } else if (contentItem.value !== undefined) {
                            value = parseFloat(contentItem.value || 0);
                            percentage = parseFloat(contentItem.percentage || 0);
                        }

                        const color = contentItem.attributes?.color || contentItem.color || null;

                        interchange.push({
                            type: contentItem.type,
                            value: value,
                            percentage: percentage,
                            color: color,
                            unit: 'MW'
                        });
                    }
                }
                else if (storageTypes.includes(item.type)) {
                    for (const contentItem of item.attributes.content) {
                        if (!contentItem || !contentItem.type) continue;

                        let value = 0;
                        let percentage = 0;

                        if (contentItem.attributes && contentItem.attributes.values && contentItem.attributes.values.length > 0) {
                            const valueObj = contentItem.attributes.values[0];
                            value = parseFloat(valueObj.value || 0);
                            percentage = parseFloat(valueObj.percentage || 0);
                        } else if (contentItem.value !== undefined) {
                            value = parseFloat(contentItem.value || 0);
                            percentage = parseFloat(contentItem.percentage || 0);
                        }

                        const color = contentItem.attributes?.color || contentItem.color || null;

                        if (value < 0) {
                            demand.push({
                                type: contentItem.type,
                                value: Math.abs(value),
                                percentage: percentage,
                                color: color,
                                unit: 'MW'
                            });
                        } else {
                            generation.push({
                                type: contentItem.type,
                                value: value,
                                percentage: percentage,
                                color: color,
                                unit: 'MW'
                            });
                        }
                    }
                }
            }
        }

        if (generation.length === 0) {
            generation.push({
                type: 'No disponible',
                value: 0,
                percentage: 0,
                color: null,
                unit: 'MW'
            });
        }

        if (demand.length === 0) {
            demand.push({
                type: 'No disponible',
                value: 0,
                percentage: 0,
                color: null,
                unit: 'MW'
            });
        }

        const metadata = {
            title: data.attributes?.title || 'Balance Eléctrico',
            description: data.attributes?.description || '',
            source: 'REE API'
        };

        return new ElectricBalance({
            timestamp,
            timeScope,
            generation,
            demand,
            interchange,
            metadata
        });
    }
}

module.exports = ElectricBalance;
