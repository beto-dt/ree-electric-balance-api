#!/usr/bin/env node

/**
 * @file testREEApi.js
 * @description Script para probar la conectividad y funcionamiento de la API de REE
 *
 * Este script realiza pruebas básicas contra la API de REE para verificar
 * que está accesible y devuelve datos en el formato esperado, útil para
 * diagnóstico y configuración.
 */

// Importar dependencias
const axios = require('axios');
const { program } = require('commander');
const colors = require('colors/safe');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const ora = require('ora');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

program
    .version('1.0.0')
    .description('Test connectivity and functionality of the REE API')
    .option('-s, --start <date>', 'Start date (YYYY-MM-DD)', '2019-01-01')
    .option('-e, --end <date>', 'End date (YYYY-MM-DD)', () => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    })
    .option('-t, --time-scope <scope>', 'Time scope (hour, day, month, year)', 'day')
    .option('-o, --output <file>', 'Save response to JSON file')
    .option('-b, --base-url <url>', 'Base URL for the REE API', process.env.REE_API_BASE_URL || 'https://apidatos.ree.es')
    .option('-d, --detail', 'Show detailed API response', false)
    .option('-a, --analyze', 'Analyze the structure of the response', false)
    .option('-r, --retries <number>', 'Number of retry attempts', '3')
    .option('-v, --verbose', 'Enable verbose output', false)
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
    logger.info('Starting REE API test');

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

        // Formatear fechas para la API
        const formattedStartDate = formatDateForREEApi(startDate);
        const formattedEndDate = formatDateForREEApi(endDate);

        // Construir la URL del endpoint
        const endpoint = '/es/datos/balance/balance-electrico';
        const url = `${options.baseUrl}${endpoint}`;

        logger.info(`Testing API endpoint: ${url}`);
        logger.info(`Parameters: start_date=${formattedStartDate}, end_date=${formattedEndDate}, time_trunc=${options.timeScope}`);

        // Crear instancia de axios
        const client = axios.create({
            baseURL: options.baseUrl,
            timeout: 30000, // 30 segundos
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Mostrar spinner durante la petición
        const spinner = ora('Connecting to REE API...').start();

        // Realizar la petición a la API
        let response;
        let retries = parseInt(options.retries);
        let attempt = 0;
        let success = false;

        while (!success && attempt <= retries) {
            try {
                attempt++;
                if (attempt > 1) {
                    spinner.text = `Retry attempt ${attempt}/${retries + 1}...`;
                }

                response = await client.get(endpoint, {
                    params: {
                        start_date: formattedStartDate,
                        end_date: formattedEndDate,
                        time_trunc: options.timeScope
                    }
                });

                success = true;
            } catch (error) {
                if (attempt > retries) {
                    throw error;
                }

                // Esperar antes de reintentar
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }

        // Detener spinner
        spinner.succeed('Successfully connected to REE API');

        // Información de la respuesta
        logger.success(`API responded with status: ${response.status}`);
        logger.info(`Response time: ${response.headers['x-response-time'] || 'unknown'}`);

        // Verificar la estructura de la respuesta
        if (!response.data || !response.data.included || !response.data.data) {
            logger.warn('API response does not have the expected structure');
        } else {
            logger.success('API response has the expected structure');

            // Verificar contenido básico
            const hasData = response.data.data && response.data.data.attributes;
            const hasGeneration = response.data.included &&
                response.data.included.some(item => item.type === 'generation');
            const hasDemand = response.data.included &&
                response.data.included.some(item => item.type === 'demand');
            const hasInterchange = response.data.included &&
                response.data.included.some(item => item.type === 'interchange');

            logger.info(`Data present: ${hasData ? colors.green('Yes') : colors.red('No')}`);
            logger.info(`Generation data: ${hasGeneration ? colors.green('Yes') : colors.red('No')}`);
            logger.info(`Demand data: ${hasDemand ? colors.green('Yes') : colors.red('No')}`);
            logger.info(`Interchange data: ${hasInterchange ? colors.green('Yes') : colors.red('No')}`);

            // Contar puntos de datos
            let dataPoints = 0;
            if (response.data.data.attributes &&
                response.data.data.attributes.values &&
                Array.isArray(response.data.data.attributes.values)) {
                dataPoints = response.data.data.attributes.values.length;
            }

            logger.info(`Number of data points: ${dataPoints}`);
        }

        // Análisis detallado de la estructura si se solicita
        if (options.analyze) {
            analyzeApiResponse(response.data);
        }

        // Mostrar respuesta completa si se solicita
        if (options.detail) {
            console.log('\n' + colors.cyan('API Response:'));
            console.log(JSON.stringify(response.data, null, 2));
        }

        // Guardar respuesta a archivo si se especifica
        if (options.output) {
            const outputPath = path.resolve(process.cwd(), options.output);
            fs.writeFileSync(outputPath, JSON.stringify(response.data, null, 2));
            logger.success(`Response saved to: ${outputPath}`);
        }

        logger.success('API test completed successfully');

    } catch (error) {
        logger.error('API test failed:', error);

        if (error.response) {
            // Error con respuesta del servidor
            const { status, statusText, data } = error.response;
            logger.error(`Server responded with status: ${status} ${statusText}`);

            if (data) {
                logger.error('Response data:');
                console.log(JSON.stringify(data, null, 2));
            }
        } else if (error.request) {
            // Error sin respuesta (no network)
            logger.error('No response received from server.');

            if (error.code === 'ECONNABORTED') {
                logger.error('The request timed out. Check your connection or try again later.');
            } else if (error.code === 'ENOTFOUND') {
                logger.error('Could not resolve the hostname. Check the base URL and your internet connection.');
            } else {
                logger.error(`Connection error: ${error.code}`);
            }
        } else {
            // Otro tipo de error
            logger.error(`Error: ${error.message}`);
        }

        process.exit(1);
    }
}

/**
 * Formatea una fecha para la API de REE
 *
 * @param {Date} date - Fecha a formatear
 * @returns {string} - Fecha formateada en formato 'YYYY-MM-DDThh:mm'
 */
function formatDateForREEApi(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Analiza la estructura de la respuesta de la API
 *
 * @param {Object} response - Respuesta de la API
 */
function analyzeApiResponse(response) {
    console.log('\n' + colors.cyan('API Response Structure Analysis:'));

    // Analizar estructura de nivel superior
    const topLevelKeys = Object.keys(response);
    console.log(colors.yellow('\nTop level keys:'), topLevelKeys.join(', '));

    // Analizar data
    if (response.data) {
        console.log(colors.yellow('\nData Structure:'));
        console.log(`- Type: ${response.data.type || 'undefined'}`);
        console.log(`- ID: ${response.data.id || 'undefined'}`);

        if (response.data.attributes) {
            const attrs = Object.keys(response.data.attributes);
            console.log(`- Attributes: ${attrs.join(', ')}`);

            if (response.data.attributes.title) {
                console.log(`  - Title: ${response.data.attributes.title}`);
            }

            if (response.data.attributes['last-update']) {
                console.log(`  - Last Update: ${response.data.attributes['last-update']}`);
            }

            if (response.data.attributes.values && Array.isArray(response.data.attributes.values)) {
                console.log(`  - Values: ${response.data.attributes.values.length} items`);
                if (response.data.attributes.values.length > 0) {
                    console.log(`    - Sample: ${JSON.stringify(response.data.attributes.values[0])}`);
                }
            }
        }
    }

    if (response.included && Array.isArray(response.included)) {
        console.log(colors.yellow('\nIncluded Items:'));

        const typeCount = {};
        response.included.forEach(item => {
            typeCount[item.type] = (typeCount[item.type] || 0) + 1;
        });

        Object.entries(typeCount).forEach(([type, count]) => {
            console.log(`- ${type}: ${count} items`);

            // Mostrar muestra del primer item de cada tipo
            const sample = response.included.find(item => item.type === type);
            if (sample && sample.attributes) {
                if (sample.attributes.title) {
                    console.log(`  - Title: ${sample.attributes.title}`);
                }

                if (sample.attributes.content && Array.isArray(sample.attributes.content)) {
                    console.log(`  - Content: ${sample.attributes.content.length} items`);
                    if (sample.attributes.content.length > 0) {
                        const firstContent = sample.attributes.content[0];
                        console.log(`    - Types: ${sample.attributes.content.map(c => c.type).join(', ')}`);
                        console.log(`    - Sample: ${JSON.stringify(firstContent)}`);
                    }
                }
            }
        });
    }

    if (response.links) {
        console.log(colors.yellow('\nLinks:'));
        Object.entries(response.links).forEach(([key, value]) => {
            console.log(`- ${key}: ${value}`);
        });
    }

    if (response.meta) {
        console.log(colors.yellow('\nMeta:'));
        Object.keys(response.meta).forEach(key => {
            console.log(`- ${key}: ${JSON.stringify(response.meta[key])}`);
        });
    }
}

main();
