/**
 * @file ElectricBalanceModel.js
 * @description Modelo de MongoDB para datos de balance eléctrico
 *
 * Este archivo define el esquema y modelo de MongoDB para almacenar
 * los datos de balance eléctrico obtenidos de la API de REE.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Esquema para representar un item de generación, demanda o intercambio
 */
const balanceItemSchema = new Schema({
    // Tipo de generación/demanda/intercambio
    type: {
        type: String,
        required: true,
        index: true
    },
    // Valor en MW
    value: {
        type: Number,
        required: true
    },
    // Porcentaje respecto al total
    percentage: {
        type: Number,
        default: 0
    },
    // Color para visualización (opcional)
    color: {
        type: String,
        default: null
    },
    // Unidad de medida
    unit: {
        type: String,
        default: 'MW'
    }
}, { _id: false });

/**
 * Esquema principal para el balance eléctrico
 */
const electricBalanceSchema = new Schema({
    // Fecha y hora a la que corresponden los datos
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    // Alcance temporal (hour, day, month, year)
    timeScope: {
        type: String,
        enum: ['hour', 'day', 'month', 'year'],
        required: true,
        index: true
    },
    // Datos de generación por tipo
    generation: {
        type: [balanceItemSchema],
        default: []
    },
    // Datos de demanda
    demand: {
        type: [balanceItemSchema],
        default: []
    },
    // Datos de intercambios internacionales
    interchange: {
        type: [balanceItemSchema],
        default: []
    },
    // Valores pre-calculados para optimizar consultas
    totalGeneration: {
        type: Number,
        default: 0
    },
    totalDemand: {
        type: Number,
        default: 0
    },
    balance: {
        type: Number,
        default: 0
    },
    renewablePercentage: {
        type: Number,
        default: 0,
        validate: {
            validator: function(v) {
                return Number.isFinite(v);
            },
            message: props => `${props.value} is not a valid percentage value`
        }
    },
    // Metadatos adicionales
    metadata: {
        title: String,
        description: String,
        source: {
            type: String,
            default: 'REE API'
        },
        originalResponse: {
            type: Schema.Types.Mixed,
            select: false // No se incluye por defecto en las consultas
        }
    }
}, {
    timestamps: true, // Añade createdAt y updatedAt automáticamente
    collection: 'electric_balances'
});

/**
 * Índices compuestos para optimizar las consultas frecuentes
 */
electricBalanceSchema.index({ timestamp: 1, timeScope: 1 }, { unique: true });
electricBalanceSchema.index({ timeScope: 1, 'generation.type': 1 });
electricBalanceSchema.index({ timestamp: 1, totalGeneration: 1 });
electricBalanceSchema.index({ timestamp: 1, totalDemand: 1 });
electricBalanceSchema.index({ timestamp: 1, renewablePercentage: 1 });

/**
 * Método para convertir un documento a un objeto plano eliminando propiedades internas de MongoDB
 */
electricBalanceSchema.methods.toPlainObject = function() {
    const obj = this.toObject();

    // Transformar _id a id
    obj.id = obj._id.toString();
    delete obj._id;
    delete obj.__v;

    // Eliminar originalResponse para reducir tamaño si no se solicita explícitamente
    if (obj.metadata && obj.metadata.originalResponse) {
        delete obj.metadata.originalResponse;
    }

    return obj;
};

/**
 * Método estático para calcular estadísticas agregadas
 */
electricBalanceSchema.statics.getStatsByDateRange = async function(startDate, endDate, timeScope) {
    return this.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate, $lte: endDate },
                timeScope: timeScope
            }
        },
        {
            $group: {
                _id: null,
                avgTotalGeneration: { $avg: '$totalGeneration' },
                maxTotalGeneration: { $max: '$totalGeneration' },
                minTotalGeneration: { $min: '$totalGeneration' },
                avgTotalDemand: { $avg: '$totalDemand' },
                maxTotalDemand: { $max: '$totalDemand' },
                minTotalDemand: { $min: '$totalDemand' },
                avgRenewablePercentage: { $avg: '$renewablePercentage' },
                maxRenewablePercentage: { $max: '$renewablePercentage' },
                minRenewablePercentage: { $min: '$renewablePercentage' },
                count: { $sum: 1 }
            }
        }
    ]);
};

/**
 * Método estático para obtener la distribución de generación por tipo
 */
electricBalanceSchema.statics.getGenerationDistribution = async function(startDate, endDate, timeScope) {
    return this.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate, $lte: endDate },
                timeScope: timeScope
            }
        },
        {
            $unwind: '$generation'
        },
        {
            $group: {
                _id: '$generation.type',
                totalValue: { $sum: '$generation.value' },
                avgValue: { $avg: '$generation.value' },
                maxValue: { $max: '$generation.value' },
                minValue: { $min: '$generation.value' },
                color: { $first: '$generation.color' },
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                type: '$_id',
                totalValue: 1,
                avgValue: 1,
                maxValue: 1,
                minValue: 1,
                color: 1,
                count: 1,
                _id: 0
            }
        },
        {
            $sort: { totalValue: -1 }
        }
    ]);
};

/**
 * Método estático para obtener la evolución temporal de un indicador
 */
electricBalanceSchema.statics.getTimeSeriesForIndicator = async function(indicator, startDate, endDate, timeScope) {
    // Validar que el indicador es permitido
    const allowedIndicators = [
        'totalGeneration', 'totalDemand', 'balance', 'renewablePercentage'
    ];

    if (!allowedIndicators.includes(indicator)) {
        throw new Error(`Invalid indicator: ${indicator}. Allowed values: ${allowedIndicators.join(', ')}`);
    }

    return this.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate, $lte: endDate },
                timeScope: timeScope
            }
        },
        {
            $project: {
                timestamp: 1,
                value: `$${indicator}`,
                _id: 0
            }
        },
        {
            $sort: { timestamp: 1 }
        }
    ]);
};

/**
 * Hook para calcular campos derivados antes de guardar
 */
electricBalanceSchema.pre('save', function(next) {
    // Calcular totalGeneration sumando los valores de generación
    this.totalGeneration = this.generation.reduce(
      (sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0), 0
    );

    // Calcular totalDemand sumando los valores de demanda
    this.totalDemand = this.demand.reduce(
      (sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0), 0
    );

    // Calcular balance entre generación y demanda
    this.balance = this.totalGeneration - this.totalDemand;

    // Calcular porcentaje de generación renovable
    const renewableTypes = [
        'Hidráulica', 'Eólica', 'Solar fotovoltaica', 'Solar térmica',
        'Otras renovables', 'Hidroeólica'
    ];

    const renewableGeneration = this.generation
      .filter(item => renewableTypes.includes(item.type))
      .reduce((sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0), 0);

    // Evitar división por cero y valores NaN
    if (this.totalGeneration > 0) {
        this.renewablePercentage = (renewableGeneration / this.totalGeneration) * 100;
    } else {
        // Si no hay generación total, establecer un valor predeterminado
        this.renewablePercentage = 0;
    }

    // Asegurarse de que no guardamos NaN
    if (Number.isNaN(this.renewablePercentage)) {
        this.renewablePercentage = 0;
    }

    next();
});

// Crear y exportar el modelo
const ElectricBalanceModel = mongoose.model('ElectricBalance', electricBalanceSchema);

module.exports = ElectricBalanceModel;
