#!/usr/bin/env node

/**
 * @file seedDatabase.js
 * @description Script para cargar datos iniciales en la base de datos
 *
 * Este script obtiene datos históricos de balance eléctrico desde la API de REE
 * y los carga en la base de datos MongoDB para proporcionar una configuración
 * inicial con datos reales.
 */

// Importar dependencias
const mongoose = require('mongoose');
const { program } = require('commander');
const colors = require('colors/safe');
const ProgressBar = require('progress');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Importar componentes de la aplicación
const REEApiService = require('../src/infrastructure/external/REEApiService');
const ElectricBalanceModel = require('../src/infrastructure/database/models/ElectricBalanceModel');
const ElectricBalance = require('../src/domain/entities/ElectricBalance');
const { formatDateForREEApi } = require('../src/utils/dateFormatter');

// Configurar opciones del CLI
program
    .version('1.0.0')
    .description('Seed the database with historical electric balance data from REE API')
    .option('-s, --start <date>', 'Start date (YYYY-MM-DD)', '2019-01-01')
    .option('-e, --end <date>', 'End date (YYYY-MM-DD)', () => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    })
    .option('-t, --time-scope <scope>', 'Time scope (hour, day, month, year)', 'day')
    .option('-c, --chunk-size <size>', 'Number of days to fetch at once', '30')
    .option('-d, --db <connection-string>', 'MongoDB connection string', process.env.MONGODB_URI || 'mongodb://localhost:27017/electric-balance')
    .option('-f, --force', 'Force update existing records', false)
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--dry-run', 'Simulate the process without storing data', false)
    .parse(process.argv);

// Obtener opciones
const options = program.opts();

// Configurar logger
const logger = {
    info: (msg) => console.log(colors.blue('INFO:'), msg),
    warn: (msg) => console.log(colors.yellow('WARN:'), msg),
    error: (msg, err) => {
        console.error(colors.red('ERROR:'), msg);
        if (err && options.verbose) {
            console.error(colors.red(err.stack || err));
        }
    },
    success: (msg) => console.log(colors.green('SUCCESS:'), msg),
    debug: (msg) => options.verbose && console.log(colors.gray('DEBUG:'), msg)
};

/**
 * Función principal del script
 */
async function main() {
    logger.info('Starting database seed process');

    try {
        // Validar y parsear fechas
        const startDate = new Date(options.start);
        const endDate = new Date(options.end);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error('Invalid date format. Use YYYY-MM-DD');
        }

        if (startDate > endDate) {
            throw new Error('Start date must be before end date');
        }

        // Validar time scope
        const validScopes = ['hour', 'day', 'month', 'year'];
        if (!validScopes.includes(options.timeScope)) {
            throw new Error(`Invalid time scope. Valid values: ${validScopes.join(', ')}`);
        }

        // Si es un dry run, notificar
        if (options.dryRun) {
            logger.warn('DRY RUN MODE: No data will be stored in the database');
        }

        // Conectar a la base de datos
        logger.info(`Connecting to MongoDB: ${options.db}`);
        if (!options.dryRun) {
            await mongoose.connect(options.db, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            logger.success('Connected to MongoDB');
        }

        // Inicializar servicio de API de REE
        const reeApiService = new REEApiService({
            baseUrl: process.env.REE_API_BASE_URL || 'https://apidatos.ree.es',
            timeout: parseInt(process.env.REE_API_TIMEOUT || '10000'),
            headers: {}
        }, logger);

        // Calcular número de días entre fechas
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const chunkSize = parseInt(options.chunkSize);

        logger.info(`Fetching data from ${options.start} to ${options.end} (${totalDays} days) with time scope: ${options.timeScope}`);

        // Inicializar estadísticas
        const stats = {
            totalProcessed: 0,
            totalSaved: 0,
            totalSkipped: 0,
            totalErrors: 0,
            startTime: Date.now()
        };

        // Crear barra de progreso
        const bar = new ProgressBar('[:bar] :current/:total chunks (:percent) :etas - Saved: :saved, Skipped: :skipped, Errors: :errors', {
            complete: '=',
            incomplete: ' ',
            width: 30,
            total: Math.ceil(totalDays / chunkSize)
        });

        // Procesar en chunks
        let currentDate = new Date(startDate);
        let chunkIndex = 0;

        while (currentDate < endDate) {
            // Calcular fin del chunk
            const chunkEndDate = new Date(currentDate);
            chunkEndDate.setDate(chunkEndDate.getDate() + chunkSize - 1);

            // Asegurar que no exceda la fecha final
            const actualEndDate = chunkEndDate > endDate ? endDate : chunkEndDate;

            try {
                // Formatear fechas para la API
                const formattedStartDate = formatDateForREEApi(currentDate);
                const formattedEndDate = formatDateForREEApi(actualEndDate);

                logger.debug(`Processing chunk ${chunkIndex + 1}: ${formattedStartDate} to ${formattedEndDate}`);

                // Obtener datos de la API
                const apiResponse = await reeApiService.fetchBalanceData(
                    formattedStartDate,
                    formattedEndDate,
                    options.timeScope
                );

                // Procesar la respuesta
                const { saved, skipped, errors } = await processApiResponse(apiResponse, options.timeScope, options.dryRun, options.force);

                // Actualizar estadísticas
                stats.totalProcessed++;
                stats.totalSaved += saved;
                stats.totalSkipped += skipped;
                stats.totalErrors += errors;

                // Actualizar barra de progreso
                bar.tick({
                    saved: stats.totalSaved,
                    skipped: stats.totalSkipped,
                    errors: stats.totalErrors
                });

            } catch (error) {
                logger.error(`Error processing chunk ${chunkIndex + 1}`, error);
                stats.totalErrors++;

                // Actualizar barra de progreso en caso de error
                bar.tick({
                    saved: stats.totalSaved,
                    skipped: stats.totalSkipped,
                    errors: stats.totalErrors
                });
            }

            // Avanzar al siguiente chunk
            currentDate.setDate(currentDate.getDate() + chunkSize);
            chunkIndex++;

            // Pequeña pausa para no sobrecargar la API
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Mostrar resumen
        const duration = (Date.now() - stats.startTime) / 1000;
        logger.success(`Process completed in ${duration.toFixed(2)} seconds`);
        logger.info(`Total chunks processed: ${stats.totalProcessed}`);
        logger.info(`Total records saved: ${stats.totalSaved}`);
        logger.info(`Total records skipped: ${stats.totalSkipped}`);
        logger.info(`Total errors: ${stats.totalErrors}`);

        // Cerrar conexión a la base de datos
        if (!options.dryRun) {
            await mongoose.disconnect();
            logger.info('Disconnected from MongoDB');
        }

        process.exit(0);

    } catch (error) {
        logger.error('Fatal error:', error);

        // Cerrar conexión a la base de datos en caso de error
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
            logger.info('Disconnected from MongoDB');
        }

        process.exit(1);
    }
}

/**
 * Procesa la respuesta de la API y guarda los datos
 *
 * @param {Object} apiResponse - Respuesta de la API de REE
 * @param {string} timeScope - Alcance temporal
 * @param {boolean} dryRun - Si es un dry run
 * @param {boolean} force - Forzar actualización de registros existentes
 * @returns {Object} - Estadísticas de procesamiento
 */
async function processApiResponse(apiResponse, timeScope, dryRun, force) {
    const stats = { saved: 0, skipped: 0, errors: 0 };

    if (!apiResponse) {
        throw new Error('API response is null or undefined');
    }

    try {
        // Crear entidades de balance eléctrico
        let electricBalances = [];

        try {
            // Crear una entidad a partir de la respuesta completa
            const balance = ElectricBalance.fromREEApiResponse(apiResponse);
            electricBalances.push(balance);
            logger.debug(`Created entity for ${balance.timestamp}`);
        } catch (error) {
            logger.error(`Error creating entity: ${error.message}`, error);
            stats.errors++;
        }

        logger.debug(`Created ${electricBalances.length} entities`);

        // Si es un dry run, no guardar
        if (dryRun) {
            logger.debug(`[DRY RUN] Would save ${electricBalances.length} records`);
            stats.skipped = electricBalances.length;
            return stats;
        }

        // Guardar cada entidad
        for (const balance of electricBalances) {
            try {
                // Verificar si tienen elementos
                logger.debug(`Entity has: generation=${balance.generation.length}, demand=${balance.demand.length}, interchange=${balance.interchange.length}`);

                // Preparar documento para MongoDB
                const balanceData = {
                    timestamp: balance.timestamp,
                    timeScope: balance.timeScope,
                    generation: balance.generation,
                    demand: balance.demand,
                    interchange: balance.interchange,
                    metadata: {
                        title: balance.metadata.title || 'Balance Eléctrico',
                        description: balance.metadata.description || '',
                        source: balance.metadata.source || 'REE API'
                    }
                };

                // Verificar si ya existe un registro para esta fecha y scope
                const existsQuery = {
                    timestamp: balance.timestamp,
                    timeScope: balance.timeScope
                };

                const exists = await ElectricBalanceModel.findOne(existsQuery);

                if (exists && !force) {
                    // Ya existe y no se fuerza actualización
                    logger.debug(`Record already exists for ${balance.timestamp} - skipping`);
                    stats.skipped++;
                } else if (exists && force) {
                    // Existe y se fuerza actualización
                    logger.debug(`Updating record for ${balance.timestamp}`);
                    await ElectricBalanceModel.findByIdAndUpdate(
                      exists._id,
                      balanceData,
                      { new: true }
                    );
                    stats.saved++;
                } else {
                    // No existe, crear nuevo
                    logger.debug(`Creating new record for ${balance.timestamp}`);
                    const doc = new ElectricBalanceModel(balanceData);
                    await doc.save();
                    stats.saved++;
                }

            } catch (error) {
                logger.error(`Error saving: ${error.message}`, error);
                stats.errors++;
            }
        }

        return stats;

    } catch (error) {
        logger.error('Error en processApiResponse:', error);
        throw error;
    }
}

// Ejecutar script
main();
