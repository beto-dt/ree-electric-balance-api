/**
 * @file ElectricBalanceService.js
 * @description Servicio de dominio para la gestión del balance eléctrico
 *
 * Este servicio encapsula la lógica de negocio relacionada con el balance eléctrico,
 * coordinando operaciones que pueden involucrar múltiples entidades o reglas complejas.
 */

/**
 * Servicio para gestionar la lógica de negocio del balance eléctrico
 */
class ElectricBalanceService {
    /**
     * Crea una nueva instancia del servicio
     *
     * @param {import('../repositories/ElectricBalanceRepository')} electricBalanceRepository - Repositorio de balance eléctrico
     */
    constructor(electricBalanceRepository) {
        this.electricBalanceRepository = electricBalanceRepository;
    }

    /**
     * Analiza los datos de balance eléctrico para un rango de fechas
     *
     * @param {Date} startDate - Fecha inicial
     * @param {Date} endDate - Fecha final
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @returns {Promise<Object>} - Análisis completo del balance eléctrico
     * @throws {Error} - Si hay problemas al obtener o procesar los datos
     */
    async analyzeBalanceDataByDateRange(startDate, endDate, timeScope = 'day') {
        const balanceData = await this.electricBalanceRepository.findByDateRange(
            startDate,
            endDate,
            timeScope
        );

        if (!balanceData || balanceData.length === 0) {
            return {
                isEmpty: true,
                period: { startDate, endDate, timeScope },
                message: 'No data available for the specified date range'
            };
        }

        const totalGeneration = balanceData.reduce((sum, balance) =>
            sum + balance.getTotalGeneration(), 0);

        const totalDemand = balanceData.reduce((sum, balance) =>
            sum + balance.getTotalDemand(), 0);

        const averageRenewablePercentage = balanceData.reduce((sum, balance) =>
            sum + balance.getRenewablePercentage(), 0) / balanceData.length;

        const generationByType = this._aggregateGenerationByType(balanceData);

        const trends = this._analyzeTrends(balanceData);

        return {
            isEmpty: false,
            period: { startDate, endDate, timeScope },
            summary: {
                totalGeneration,
                totalDemand,
                netBalance: totalGeneration - totalDemand,
                averageRenewablePercentage,
                dataPoints: balanceData.length
            },
            generationDistribution: generationByType,
            timeSeries: this._createTimeSeries(balanceData),
            trends,
            rawData: balanceData.map(balance => balance.toJSON())
        };
    }

    /**
     * Compara dos períodos de tiempo para identificar cambios y tendencias
     *
     * @param {Date} currentPeriodStart - Inicio del período actual
     * @param {Date} currentPeriodEnd - Fin del período actual
     * @param {Date} previousPeriodStart - Inicio del período anterior
     * @param {Date} previousPeriodEnd - Fin del período anterior
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @returns {Promise<Object>} - Análisis comparativo entre períodos
     * @throws {Error} - Si hay problemas al obtener o procesar los datos
     */
    async comparePeriods(
        currentPeriodStart,
        currentPeriodEnd,
        previousPeriodStart,
        previousPeriodEnd,
        timeScope = 'day'
    ) {
        const [currentPeriodData, previousPeriodData] = await Promise.all([
            this.electricBalanceRepository.findByDateRange(currentPeriodStart, currentPeriodEnd, timeScope),
            this.electricBalanceRepository.findByDateRange(previousPeriodStart, previousPeriodEnd, timeScope)
        ]);

        const currentTotalGeneration = currentPeriodData.reduce((sum, balance) =>
            sum + balance.getTotalGeneration(), 0);
        const currentTotalDemand = currentPeriodData.reduce((sum, balance) =>
            sum + balance.getTotalDemand(), 0);
        const currentRenewablePercentage = currentPeriodData.reduce((sum, balance) =>
            sum + balance.getRenewablePercentage(), 0) / currentPeriodData.length;

        const previousTotalGeneration = previousPeriodData.reduce((sum, balance) =>
            sum + balance.getTotalGeneration(), 0);
        const previousTotalDemand = previousPeriodData.reduce((sum, balance) =>
            sum + balance.getTotalDemand(), 0);
        const previousRenewablePercentage = previousPeriodData.reduce((sum, balance) =>
            sum + balance.getRenewablePercentage(), 0) / previousPeriodData.length;

        const generationChange = this._calculatePercentageChange(
            currentTotalGeneration,
            previousTotalGeneration
        );
        const demandChange = this._calculatePercentageChange(
            currentTotalDemand,
            previousTotalDemand
        );
        const renewableChange = this._calculatePercentageChange(
            currentRenewablePercentage,
            previousRenewablePercentage
        );

        const currentGenerationByType = this._aggregateGenerationByType(currentPeriodData);
        const previousGenerationByType = this._aggregateGenerationByType(previousPeriodData);
        const generationTypeChanges = this._compareGenerationDistributions(
            currentGenerationByType,
            previousGenerationByType
        );

        return {
            currentPeriod: {
                start: currentPeriodStart,
                end: currentPeriodEnd,
                dataPoints: currentPeriodData.length
            },
            previousPeriod: {
                start: previousPeriodStart,
                end: previousPeriodEnd,
                dataPoints: previousPeriodData.length
            },
            changes: {
                generation: {
                    current: currentTotalGeneration,
                    previous: previousTotalGeneration,
                    percentageChange: generationChange,
                    trend: generationChange > 0 ? 'increase' : 'decrease'
                },
                demand: {
                    current: currentTotalDemand,
                    previous: previousTotalDemand,
                    percentageChange: demandChange,
                    trend: demandChange > 0 ? 'increase' : 'decrease'
                },
                renewablePercentage: {
                    current: currentRenewablePercentage,
                    previous: previousRenewablePercentage,
                    percentageChange: renewableChange,
                    trend: renewableChange > 0 ? 'increase' : 'decrease'
                },
                generationTypes: generationTypeChanges
            }
        };
    }

    /**
     * Calcula métricas de sostenibilidad basadas en los datos de balance eléctrico
     *
     * @param {Date} startDate - Fecha inicial
     * @param {Date} endDate - Fecha final
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @returns {Promise<Object>} - Métricas de sostenibilidad
     * @throws {Error} - Si hay problemas al obtener o procesar los datos
     */
    async calculateSustainabilityMetrics(startDate, endDate, timeScope = 'day') {
        const balanceData = await this.electricBalanceRepository.findByDateRange(
            startDate,
            endDate,
            timeScope
        );

        if (!balanceData || balanceData.length === 0) {
            return {
                isEmpty: true,
                period: { startDate, endDate, timeScope },
                message: 'No data available for the specified date range'
            };
        }

        const renewableTypes = [
            'Hidráulica', 'Eólica', 'Solar fotovoltaica', 'Solar térmica',
            'Otras renovables', 'Hidroeólica'
        ];

        const lowCarbonTypes = [
            ...renewableTypes, 'Nuclear'
        ];

        let totalGeneration = 0;
        let renewableGeneration = 0;
        let lowCarbonGeneration = 0;

        for (const balance of balanceData) {
            const generationTotal = balance.getTotalGeneration();
            totalGeneration += generationTotal;

            for (const gen of balance.generation) {
                if (renewableTypes.includes(gen.type)) {
                    renewableGeneration += gen.value;
                }

                if (lowCarbonTypes.includes(gen.type)) {
                    lowCarbonGeneration += gen.value;
                }
            }
        }

        const renewablePercentage = (renewableGeneration / totalGeneration) * 100;
        const lowCarbonPercentage = (lowCarbonGeneration / totalGeneration) * 100;

        const hoursInPeriod = (endDate - startDate) / (1000 * 60 * 60);
        const co2Avoided = (renewableGeneration * hoursInPeriod * 0.5) / 1000; // en toneladas

        return {
            isEmpty: false,
            period: { startDate, endDate, timeScope },
            metrics: {
                totalGeneration,
                renewableGeneration,
                lowCarbonGeneration,
                renewablePercentage,
                lowCarbonPercentage,
                co2AvoidedEstimation: co2Avoided,
                sustainabilityScore: this._calculateSustainabilityScore(
                    renewablePercentage,
                    lowCarbonPercentage
                )
            },
            dailyTrend: this._calculateDailyTrend(balanceData, renewableTypes, lowCarbonTypes)
        };
    }

    /**
     * Identifica patrones y anomalías en los datos de balance eléctrico
     *
     * @param {Date} startDate - Fecha inicial
     * @param {Date} endDate - Fecha final
     * @param {string} timeScope - Alcance temporal (day, month, year)
     * @returns {Promise<Object>} - Patrones y anomalías detectados
     * @throws {Error} - Si hay problemas al obtener o procesar los datos
     */
    async detectPatternsAndAnomalies(startDate, endDate, timeScope = 'day') {
        const balanceData = await this.electricBalanceRepository.findByDateRange(
            startDate,
            endDate,
            timeScope
        );

        if (!balanceData || balanceData.length === 0) {
            return {
                isEmpty: true,
                period: { startDate, endDate, timeScope },
                message: 'No data available for the specified date range'
            };
        }

        const generationSeries = balanceData.map(balance => ({
            timestamp: balance.timestamp,
            value: balance.getTotalGeneration()
        }));

        const demandSeries = balanceData.map(balance => ({
            timestamp: balance.timestamp,
            value: balance.getTotalDemand()
        }));

        const renewableSeries = balanceData.map(balance => ({
            timestamp: balance.timestamp,
            value: balance.getRenewablePercentage()
        }));

        const generationAnomalies = this._detectAnomalies(generationSeries);
        const demandAnomalies = this._detectAnomalies(demandSeries);
        const renewableAnomalies = this._detectAnomalies(renewableSeries);

        const cyclicalPatterns = this._detectCyclicalPatterns(demandSeries);

        return {
            isEmpty: false,
            period: { startDate, endDate, timeScope },
            anomalies: {
                generation: generationAnomalies,
                demand: demandAnomalies,
                renewablePercentage: renewableAnomalies
            },
            patterns: {
                cyclical: cyclicalPatterns,
                correlations: this._detectCorrelations(balanceData)
            }
        };
    }

    /**
     * Agrega datos de generación por tipo
     *
     * @param {Array<import('../entities/ElectricBalance')>} balanceData - Datos de balance eléctrico
     * @returns {Object} - Datos agregados por tipo de generación
     * @private
     */
    _aggregateGenerationByType(balanceData) {
        const aggregatedByType = {};

        for (const balance of balanceData) {
            for (const genItem of balance.generation) {
                const { type, value, color } = genItem;

                if (!aggregatedByType[type]) {
                    aggregatedByType[type] = {
                        totalValue: 0,
                        percentage: 0,
                        color
                    };
                }

                aggregatedByType[type].totalValue += value;
            }
        }

        const totalGeneration = Object.values(aggregatedByType)
            .reduce((sum, item) => sum + item.totalValue, 0);

        for (const type in aggregatedByType) {
            aggregatedByType[type].percentage =
                (aggregatedByType[type].totalValue / totalGeneration) * 100;
        }

        return aggregatedByType;
    }

    /**
     * Analiza tendencias en los datos de balance eléctrico
     *
     * @param {Array<import('../entities/ElectricBalance')>} balanceData - Datos de balance eléctrico
     * @returns {Object} - Análisis de tendencias
     * @private
     */
    _analyzeTrends(balanceData) {
        if (balanceData.length < 2) {
            return {
                insufficient: true,
                message: 'Insufficient data points to analyze trends'
            };
        }

        const sortedData = [...balanceData].sort((a, b) =>
            a.timestamp.getTime() - b.timestamp.getTime());

        const generationValues = sortedData.map(b => b.getTotalGeneration());
        const demandValues = sortedData.map(b => b.getTotalDemand());
        const renewableValues = sortedData.map(b => b.getRenewablePercentage());

        const generationTrend = this._calculateTrend(generationValues);
        const demandTrend = this._calculateTrend(demandValues);
        const renewableTrend = this._calculateTrend(renewableValues);

        return {
            generation: {
                trend: generationTrend > 0 ? 'upward' : generationTrend < 0 ? 'downward' : 'stable',
                slope: generationTrend,
                startValue: generationValues[0],
                endValue: generationValues[generationValues.length - 1],
                changePercentage: this._calculatePercentageChange(
                    generationValues[generationValues.length - 1],
                    generationValues[0]
                )
            },
            demand: {
                trend: demandTrend > 0 ? 'upward' : demandTrend < 0 ? 'downward' : 'stable',
                slope: demandTrend,
                startValue: demandValues[0],
                endValue: demandValues[demandValues.length - 1],
                changePercentage: this._calculatePercentageChange(
                    demandValues[demandValues.length - 1],
                    demandValues[0]
                )
            },
            renewablePercentage: {
                trend: renewableTrend > 0 ? 'upward' : renewableTrend < 0 ? 'downward' : 'stable',
                slope: renewableTrend,
                startValue: renewableValues[0],
                endValue: renewableValues[renewableValues.length - 1],
                changePercentage: this._calculatePercentageChange(
                    renewableValues[renewableValues.length - 1],
                    renewableValues[0]
                )
            }
        };
    }

    /**
     * Crea series temporales para visualización
     *
     * @param {Array<import('../entities/ElectricBalance')>} balanceData - Datos de balance eléctrico
     * @returns {Object} - Series temporales para cada indicador principal
     * @private
     */
    _createTimeSeries(balanceData) {
        const sortedData = [...balanceData].sort((a, b) =>
            a.timestamp.getTime() - b.timestamp.getTime());

        const generation = sortedData.map(balance => ({
            timestamp: balance.timestamp,
            value: balance.getTotalGeneration()
        }));

        const demand = sortedData.map(balance => ({
            timestamp: balance.timestamp,
            value: balance.getTotalDemand()
        }));

        const renewablePercentage = sortedData.map(balance => ({
            timestamp: balance.timestamp,
            value: balance.getRenewablePercentage()
        }));

        const balance = sortedData.map(balance => ({
            timestamp: balance.timestamp,
            value: balance.getBalance()
        }));

        const generationByType = {};

        if (sortedData.length > 0) {
            const firstBalance = sortedData[0];
            for (const gen of firstBalance.generation) {
                generationByType[gen.type] = [];
            }

            for (const balance of sortedData) {
                for (const gen of balance.generation) {
                    generationByType[gen.type].push({
                        timestamp: balance.timestamp,
                        value: gen.value,
                        percentage: gen.percentage
                    });
                }
            }
        }

        return {
            totalGeneration: generation,
            totalDemand: demand,
            renewablePercentage: renewablePercentage,
            balance: balance,
            generationByType: generationByType
        };
    }

    /**
     * Calcula el cambio porcentual entre dos valores
     *
     * @param {number} current - Valor actual
     * @param {number} previous - Valor anterior
     * @returns {number} - Cambio porcentual
     * @private
     */
    _calculatePercentageChange(current, previous) {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / Math.abs(previous)) * 100;
    }

    /**
     * Compara distribuciones de generación entre períodos
     *
     * @param {Object} currentDist - Distribución actual
     * @param {Object} previousDist - Distribución anterior
     * @returns {Array<Object>} - Cambios por tipo de generación
     * @private
     */
    _compareGenerationDistributions(currentDist, previousDist) {
        const changes = [];

        const allTypes = new Set([
            ...Object.keys(currentDist),
            ...Object.keys(previousDist)
        ]);

        for (const type of allTypes) {
            const current = currentDist[type] || { totalValue: 0, percentage: 0 };
            const previous = previousDist[type] || { totalValue: 0, percentage: 0 };

            changes.push({
                type,
                currentValue: current.totalValue,
                previousValue: previous.totalValue,
                currentPercentage: current.percentage,
                previousPercentage: previous.percentage,
                valueChange: current.totalValue - previous.totalValue,
                percentageChange: current.percentage - previous.percentage,
                percentageChangeRelative: this._calculatePercentageChange(
                    current.percentage,
                    previous.percentage
                ),
                color: current.color || previous.color
            });
        }

        return changes.sort((a, b) =>
            Math.abs(b.percentageChangeRelative) - Math.abs(a.percentageChangeRelative));
    }

    /**
     * Calcula la tendencia (pendiente) de una serie de valores
     *
     * @param {Array<number>} values - Serie de valores
     * @returns {number} - Tendencia (pendiente)
     * @private
     */
    _calculateTrend(values) {
        if (values.length < 2) return 0;
        return (values[values.length - 1] - values[0]) / (values.length - 1);
    }

    /**
     * Calcula una puntuación de sostenibilidad
     *
     * @param {number} renewablePercentage - Porcentaje de renovables
     * @param {number} lowCarbonPercentage - Porcentaje de bajas emisiones
     * @returns {number} - Puntuación (0-100)
     * @private
     */
    _calculateSustainabilityScore(renewablePercentage, lowCarbonPercentage) {
        return (renewablePercentage * 0.7) +
            ((lowCarbonPercentage - renewablePercentage) * 0.3);
    }

    /**
     * Calcula la tendencia diaria de renovables y bajas emisiones
     *
     * @param {Array<import('../entities/ElectricBalance')>} balanceData - Datos de balance
     * @param {Array<string>} renewableTypes - Tipos de generación renovable
     * @param {Array<string>} lowCarbonTypes - Tipos de generación de bajas emisiones
     * @returns {Array<Object>} - Tendencia diaria
     * @private
     */
    _calculateDailyTrend(balanceData, renewableTypes, lowCarbonTypes) {
        const sortedData = [...balanceData].sort((a, b) =>
            a.timestamp.getTime() - b.timestamp.getTime());

        return sortedData.map(balance => {
            let totalGen = balance.getTotalGeneration();
            let renewableGen = 0;
            let lowCarbonGen = 0;

            for (const gen of balance.generation) {
                if (renewableTypes.includes(gen.type)) {
                    renewableGen += gen.value;
                }

                if (lowCarbonTypes.includes(gen.type)) {
                    lowCarbonGen += gen.value;
                }
            }

            return {
                date: balance.timestamp,
                totalGeneration: totalGen,
                renewableGeneration: renewableGen,
                lowCarbonGeneration: lowCarbonGen,
                renewablePercentage: (renewableGen / totalGen) * 100,
                lowCarbonPercentage: (lowCarbonGen / totalGen) * 100
            };
        });
    }

    /**
     * Detecta anomalías en una serie temporal
     *
     * @param {Array<Object>} series - Serie temporal con timestamp y value
     * @returns {Array<Object>} - Anomalías detectadas
     * @private
     */
    _detectAnomalies(series) {
        if (series.length < 3) return [];

        const values = series.map(point => point.value);
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
        const stdDev = Math.sqrt(variance);

        const anomalies = [];

        for (let i = 0; i < series.length; i++) {
            const point = series[i];
            const zScore = Math.abs((point.value - mean) / stdDev);

            if (zScore > 2) {
                anomalies.push({
                    timestamp: point.timestamp,
                    value: point.value,
                    mean,
                    deviation: point.value - mean,
                    zScore,
                    type: point.value > mean ? 'high' : 'low'
                });
            }
        }

        return anomalies;
    }

    /**
     * Detecta patrones cíclicos en una serie temporal
     *
     * @param {Array<Object>} series - Serie temporal con timestamp y value
     * @returns {Object} - Patrones cíclicos detectados (simplificado)
     * @private
     */
    _detectCyclicalPatterns(series) {
        if (series.length < 7) {
            return { detected: false, reason: 'Insufficient data points' };
        }

        const dailyPattern = this._checkDailyPattern(series);
        const weeklyPattern = this._checkWeeklyPattern(series);

        return {
            detected: dailyPattern.detected || weeklyPattern.detected,
            daily: dailyPattern,
            weekly: weeklyPattern
        };
    }

    /**
     * Comprueba patrones diarios (simplificado)
     *
     * @param {Array<Object>} series - Serie temporal
     * @returns {Object} - Información del patrón
     * @private
     */
    _checkDailyPattern(series) {
        return {
            detected: false,
            message: 'Daily pattern detection requires hourly data'
        };
    }

    /**
     * Comprueba patrones semanales (simplificado)
     *
     * @param {Array<Object>} series - Serie temporal
     * @returns {Object} - Información del patrón
     * @private
     */
    _checkWeeklyPattern(series) {
        const byDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Domingo a Sábado
        const counts = [0, 0, 0, 0, 0, 0, 0];

        for (const point of series) {
            const dayOfWeek = new Date(point.timestamp).getDay();
            byDayOfWeek[dayOfWeek] += point.value;
            counts[dayOfWeek]++;
        }

        const averagesByDay = byDayOfWeek.map((sum, i) =>
            counts[i] > 0 ? sum / counts[i] : 0);

        const avgOfAvgs = averagesByDay.reduce((sum, v) => sum + v, 0) / 7;
        const variance = averagesByDay.reduce(
            (sum, v) => sum + Math.pow(v - avgOfAvgs, 2), 0) / 7;

        const weekdayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const patternStrength = Math.sqrt(variance) / avgOfAvgs;

        return {
            detected: patternStrength > 0.1,
            strength: patternStrength,
            averagesByDay: averagesByDay.map((avg, i) => ({
                day: weekdayLabels[i],
                average: avg
            })),
            highestDay: weekdayLabels[averagesByDay.indexOf(Math.max(...averagesByDay))],
            lowestDay: weekdayLabels[averagesByDay.indexOf(Math.min(...averagesByDay))]
        };
    }

    /**
     * Detecta correlaciones entre diferentes métricas
     *
     * @param {Array<import('../entities/ElectricBalance')>} balanceData - Datos de balance
     * @returns {Array<Object>} - Correlaciones detectadas
     * @private
     */
    _detectCorrelations(balanceData) {
        const totalDemand = balanceData.map(b => b.getTotalDemand());
        const totalGeneration = balanceData.map(b => b.getTotalGeneration());
        const renewablePercentage = balanceData.map(b => b.getRenewablePercentage());

        const demandVsGeneration = this._calculateCorrelation(totalDemand, totalGeneration);
        const demandVsRenewable = this._calculateCorrelation(totalDemand, renewablePercentage);
        const generationVsRenewable = this._calculateCorrelation(totalGeneration, renewablePercentage);

        return [
            {
                between: ['Demanda', 'Generación'],
                correlation: demandVsGeneration,
                strength: this._describeCorrelationStrength(demandVsGeneration),
                direction: demandVsGeneration > 0 ? 'positiva' : 'negativa'
            },
            {
                between: ['Demanda', 'Porcentaje renovable'],
                correlation: demandVsRenewable,
                strength: this._describeCorrelationStrength(demandVsRenewable),
                direction: demandVsRenewable > 0 ? 'positiva' : 'negativa'
            },
            {
                between: ['Generación', 'Porcentaje renovable'],
                correlation: generationVsRenewable,
                strength: this._describeCorrelationStrength(generationVsRenewable),
                direction: generationVsRenewable > 0 ? 'positiva' : 'negativa'
            }
        ];
    }

    /**
     * Calcula la correlación entre dos series
     *
     * @param {Array<number>} seriesA - Primera serie de valores
     * @param {Array<number>} seriesB - Segunda serie de valores
     * @returns {number} - Coeficiente de correlación
     * @private
     */
    _calculateCorrelation(seriesA, seriesB) {
        if (seriesA.length !== seriesB.length || seriesA.length < 2) {
            return 0;
        }

        const meanA = seriesA.reduce((sum, val) => sum + val, 0) / seriesA.length;
        const meanB = seriesB.reduce((sum, val) => sum + val, 0) / seriesB.length;

        let covariance = 0;
        let varianceA = 0;
        let varianceB = 0;

        for (let i = 0; i < seriesA.length; i++) {
            const diffA = seriesA[i] - meanA;
            const diffB = seriesB[i] - meanB;

            covariance += diffA * diffB;
            varianceA += diffA * diffA;
            varianceB += diffB * diffB;
        }

        if (varianceA === 0 || varianceB === 0) {
            return 0;
        }

        return covariance / (Math.sqrt(varianceA) * Math.sqrt(varianceB));
    }

    /**
     * Describe la fuerza de una correlación
     *
     * @param {number} correlation - Coeficiente de correlación
     * @returns {string} - Descripción cualitativa
     * @private
     */
    _describeCorrelationStrength(correlation) {
        const absCorr = Math.abs(correlation);

        if (absCorr < 0.2) return 'muy débil';
        if (absCorr < 0.4) return 'débil';
        if (absCorr < 0.6) return 'moderada';
        if (absCorr < 0.8) return 'fuerte';
        return 'muy fuerte';
    }

module.exports = ElectricBalanceService;
