
/**
 * @file electricBalance.js
 * @description Definición del esquema GraphQL para balance eléctrico
 *
 * Este archivo contiene las definiciones de tipos, queries y resolvers
 * para el balance eléctrico en el esquema GraphQL.
 */

const { gql } = require('apollo-server-express');

// Definición del esquema GraphQL para balance eléctrico
const electricBalanceSchema = gql`
    """
    Tipo que representa un ítem de generación, demanda o intercambio eléctrico
    """
    type BalanceItem {
        """Tipo de generación/demanda/intercambio"""
        type: String!
        """Valor en MW"""
        value: Float!
        """Porcentaje respecto al total"""
        percentage: Float
        """Color para visualización (opcional)"""
        color: String
        """Unidad de medida"""
        unit: String
    }

    """
    Tipo que representa un balance eléctrico completo
    """
    type ElectricBalance {
        """Identificador único"""
        id: ID!
        """Fecha y hora a la que corresponden los datos"""
        timestamp: DateTime!
        """Alcance temporal (hour, day, month, year)"""
        timeScope: String!
        """Datos de generación por tipo"""
        generation: [BalanceItem!]!
        """Datos de demanda"""
        demand: [BalanceItem!]!
        """Datos de intercambios internacionales"""
        interchange: [BalanceItem!]!
        """Total de generación en MW"""
        totalGeneration: Float # Quitado el ! para permitir valores nulos
        """Total de demanda en MW"""
        totalDemand: Float!
        """Balance entre generación y demanda"""
        balance: Float!
        """Porcentaje de generación renovable"""
        renewablePercentage: Float!
        """Metadatos adicionales"""
        metadata: JSONObject
        """Fecha de creación del registro"""
        createdAt: DateTime
        """Fecha de última actualización del registro"""
        updatedAt: DateTime
    }

    """
    Tipo para estadísticas de un indicador específico
    """
    type IndicatorStats {
        """Valor promedio"""
        average: Float!
        """Valor máximo"""
        max: Float!
        """Valor mínimo"""
        min: Float!
    }

    """
    Tipo para estadísticas agregadas de balance eléctrico
    """
    type ElectricBalanceStats {
        """Estadísticas de generación"""
        generation: IndicatorStats!
        """Estadísticas de demanda"""
        demand: IndicatorStats!
        """Estadísticas de porcentaje renovable"""
        renewablePercentage: IndicatorStats!
        """Número de registros analizados"""
        count: Int!
        """Fecha de inicio del período"""
        startDate: DateTime!
        """Fecha de fin del período"""
        endDate: DateTime!
        """Alcance temporal (hour, day, month, year)"""
        timeScope: String!
    }

    """
    Tipo para distribución de generación por tipo
    """
    type GenerationDistribution {
        """Tipo de generación"""
        type: String!
        """Valor total acumulado"""
        totalValue: Float!
        """Valor promedio"""
        avgValue: Float!
        """Valor máximo"""
        maxValue: Float!
        """Valor mínimo"""
        minValue: Float!
        """Porcentaje respecto al total"""
        percentage: Float!
        """Color para visualización"""
        color: String
        """Número de registros"""
        count: Int!
    }

    """
    Tipo para datos de series temporales
    """
    type TimeSeriesPoint {
        """Fecha y hora del punto"""
        timestamp: DateTime!
        """Valor del punto"""
        value: Float!
    }

    """
    Tipo para datos de análisis de balance eléctrico
    """
    type ElectricBalanceAnalysis {
        """Estadísticas del período"""
        stats: ElectricBalanceStats!
        """Distribución de generación por tipo"""
        generationDistribution: [GenerationDistribution!]!
        """Series temporales de generación total"""
        generationSeries: [TimeSeriesPoint!]!
        """Series temporales de demanda total"""
        demandSeries: [TimeSeriesPoint!]!
        """Series temporales de porcentaje renovable"""
        renewableSeries: [TimeSeriesPoint!]!
        """Series temporales de balance (generación - demanda)"""
        balanceSeries: [TimeSeriesPoint!]!
        """Tendencias detectadas"""
        trends: JSONObject
        """Período analizado"""
        period: JSONObject!
    }

    """
    Tipo para resultados paginados de balance eléctrico
    """
    type ElectricBalancePaginatedResult {
        """Lista de balances eléctricos"""
        items: [ElectricBalance!]!
        """Número total de registros"""
        totalCount: Int!
        """Página actual"""
        page: Int!
        """Registros por página"""
        pageSize: Int!
        """Indica si hay página anterior"""
        hasPreviousPage: Boolean!
        """Indica si hay página siguiente"""
        hasNextPage: Boolean!
    }

    """
    Input para filtros de fecha
    """
    input DateRangeInput {
        """Fecha de inicio"""
        startDate: DateTime!
        """Fecha de fin"""
        endDate: DateTime!
        """Alcance temporal (hour, day, month, year)"""
        timeScope: String = "day"
    }

    """
    Input para opciones de paginación
    """
    input PaginationInput {
        """Página a recuperar (empieza en 1)"""
        page: Int = 1
        """Registros por página"""
        pageSize: Int = 20
        """Campo por el que ordenar"""
        orderBy: String = "timestamp"
        """Dirección de ordenación (ASC o DESC)"""
        orderDirection: String = "ASC"
    }

    """
    Input para filtros específicos de balance eléctrico
    """
    input ElectricBalanceFilterInput {
        """Filtro de renovables (porcentaje mínimo)"""
        minRenewablePercentage: Float
        """Filtro por tipo de generación"""
        generationType: String
        """Filtro por valor mínimo de generación total"""
        minTotalGeneration: Float
        """Filtro por valor máximo de generación total"""
        maxTotalGeneration: Float
        """Filtro por valor mínimo de demanda total"""
        minTotalDemand: Float
        """Filtro por valor máximo de demanda total"""
        maxTotalDemand: Float
    }

    """
    Input para opciones de análisis
    """
    input AnalysisOptionsInput {
        """Incluir detección de patrones"""
        includePatterns: Boolean = false
        """Incluir métricas de sostenibilidad"""
        includeSustainability: Boolean = false
        """Incluir datos de periodicidad"""
        includePeriodicity: Boolean = false
    }

    """
    Input para comparación de períodos
    """
    input ComparePeriodInput {
        """Fecha de inicio del período actual"""
        currentStartDate: DateTime!
        """Fecha de fin del período actual"""
        currentEndDate: DateTime!
        """Fecha de inicio del período anterior"""
        previousStartDate: DateTime!
        """Fecha de fin del período anterior"""
        previousEndDate: DateTime!
        """Alcance temporal"""
        timeScope: String = "day"
    }

    extend type Query {
        """
        Obtiene un balance eléctrico por su ID
        """
        electricBalance(id: ID!): ElectricBalance

        """
        Obtiene balances eléctricos por rango de fechas
        """
        electricBalanceByDateRange(
            dateRange: DateRangeInput!,
            pagination: PaginationInput,
            filters: ElectricBalanceFilterInput
        ): ElectricBalancePaginatedResult!

        """
        Obtiene estadísticas de balance eléctrico por rango de fechas
        """
        electricBalanceStats(dateRange: DateRangeInput!): ElectricBalanceStats!

        """
        Obtiene distribución de generación por tipo para un rango de fechas
        """
        generationDistribution(dateRange: DateRangeInput!): [GenerationDistribution!]!

        """
        Obtiene series temporales para un indicador específico
        """
        electricBalanceTimeSeries(
            dateRange: DateRangeInput!,
            indicator: String!
        ): [TimeSeriesPoint!]!

        """
        Obtiene análisis completo de balance eléctrico para un rango de fechas
        """
        electricBalanceAnalysis(
            dateRange: DateRangeInput!,
            options: AnalysisOptionsInput
        ): ElectricBalanceAnalysis!

        """
        Compara dos períodos de balance eléctrico
        """
        compareElectricBalancePeriods(
            periods: ComparePeriodInput!
        ): JSONObject!

        """
        Obtiene el balance eléctrico más reciente
        """
        latestElectricBalance: ElectricBalance
    }

    extend type Mutation {
        """
        Refresca los datos de balance eléctrico para un rango de fechas
        """
        refreshElectricBalanceData(
            dateRange: DateRangeInput!,
            forceUpdate: Boolean = false
        ): JSONObject!
    }
`;

module.exports = electricBalanceSchema;
