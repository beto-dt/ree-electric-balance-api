/**
 * @file dateFormatter.js
 * @description Utilidades para formateo y manipulación de fechas
 *
 * Este archivo contiene funciones para formatear fechas en diferentes formatos,
 * convertir entre formatos, calcular rangos de fechas y otras operaciones útiles
 * para trabajar con fechas en el contexto de la API de REE.
 */

/**
 * Formatea una fecha para la API de REE
 *
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} - Fecha formateada en formato 'YYYY-MM-DDThh:mm'
 */
function formatDateForREEApi(date) {
    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date: ${date}`);
    }

    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Formatea una fecha en formato ISO 8601
 *
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} - Fecha formateada en formato ISO 8601
 */
function formatDateISO(date) {
    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date: ${date}`);
    }

    return dateObj.toISOString();
}

/**
 * Formatea una fecha para mostrar en UI
 *
 * @param {Date|string} date - Fecha a formatear
 * @param {Object} options - Opciones de formateo
 * @param {string} options.locale - Locale para formateo (default: 'es-ES')
 * @param {boolean} options.includeTime - Si se debe incluir la hora (default: false)
 * @returns {string} - Fecha formateada para UI
 */
function formatDateForUI(date, options = {}) {
    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date: ${date}`);
    }

    const locale = options.locale || 'es-ES';
    const includeTime = options.includeTime !== undefined ? options.includeTime : false;

    const dateOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {})
    };

    return dateObj.toLocaleDateString(locale, dateOptions);
}

/**
 * Formatea una fecha en un formato personalizado
 *
 * @param {Date|string} date - Fecha a formatear
 * @param {string} format - Formato deseado (YYYY-MM-DD, DD/MM/YYYY, etc.)
 * @returns {string} - Fecha formateada según el formato especificado
 */
function formatDate(date, format = 'YYYY-MM-DD') {
    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date: ${date}`);
    }

    const tokens = {
        YYYY: dateObj.getFullYear(),
        MM: String(dateObj.getMonth() + 1).padStart(2, '0'),
        DD: String(dateObj.getDate()).padStart(2, '0'),
        HH: String(dateObj.getHours()).padStart(2, '0'),
        mm: String(dateObj.getMinutes()).padStart(2, '0'),
        ss: String(dateObj.getSeconds()).padStart(2, '0'),
        M: dateObj.getMonth() + 1,
        D: dateObj.getDate(),
        H: dateObj.getHours(),
        m: dateObj.getMinutes(),
        s: dateObj.getSeconds()
    };

    return format.replace(/YYYY|MM|DD|HH|mm|ss|M|D|H|m|s/g, match => tokens[match]);
}

/**
 * Convierte una fecha de string a objeto Date
 *
 * @param {string} dateString - String de fecha a convertir
 * @param {string} format - Formato del string (YYYY-MM-DD, DD/MM/YYYY, etc.)
 * @returns {Date} - Objeto Date
 */
function parseDate(dateString, format = 'YYYY-MM-DD') {
    if (!dateString) {
        throw new Error('Date string is required');
    }

    // Si el formato es automático, intentar detectarlo
    if (format === 'auto') {
        // Probar ISO primero
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(dateString)) {
            return new Date(dateString);
        }

        // Probar formato YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            format = 'YYYY-MM-DD';
        }
        // Probar formato DD/MM/YYYY
        else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
            format = 'DD/MM/YYYY';
        }
        // Probar formato MM/DD/YYYY
        else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
            format = 'MM/DD/YYYY';
        }
        else {
            throw new Error(`Could not detect format for date string: ${dateString}`);
        }
    }

    // Parsear según el formato
    let year, month, day, hour = 0, minute = 0, second = 0;

    if (format === 'YYYY-MM-DD') {
        [year, month, day] = dateString.split('-').map(Number);
        month -= 1; // Ajustar mes para Date (0-11)
    }
    else if (format === 'DD/MM/YYYY') {
        [day, month, year] = dateString.split('/').map(Number);
        month -= 1; // Ajustar mes para Date (0-11)
    }
    else if (format === 'MM/DD/YYYY') {
        [month, day, year] = dateString.split('/').map(Number);
        month -= 1; // Ajustar mes para Date (0-11)
    }
    else {
        throw new Error(`Unsupported date format: ${format}`);
    }

    return new Date(year, month, day, hour, minute, second);
}

/**
 * Calcula el rango de fechas para un período específico
 *
 * @param {string} period - Período ('today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear', 'last7Days', 'last30Days', 'last90Days', 'last365Days')
 * @returns {Object} - Objeto con startDate y endDate
 */
function getDateRangeForPeriod(period) {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;

        case 'yesterday':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
            break;

        case 'thisWeek':
            // Lunes como primer día de la semana (ajustar según necesidad)
            const dayOfWeek = now.getDay() || 7; // 0 es domingo, convertir a 7
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dayOfWeek), 23, 59, 59, 999);
            break;

        case 'lastWeek':
            const lastWeekDay = now.getDay() || 7;
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - lastWeekDay - 6);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - lastWeekDay, 23, 59, 59, 999);
            break;

        case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;

        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            break;

        case 'thisYear':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;

        case 'lastYear':
            startDate = new Date(now.getFullYear() - 1, 0, 1);
            endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
            break;

        case 'last7Days':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;

        case 'last30Days':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;

        case 'last90Days':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;

        case 'last365Days':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 364);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;

        default:
            throw new Error(`Unsupported period: ${period}`);
    }

    return { startDate, endDate };
}

/**
 * Determina la granularidad temporal adecuada según el rango de fechas
 *
 * @param {Date} startDate - Fecha de inicio
 * @param {Date} endDate - Fecha de fin
 * @returns {string} - Granularidad ('hour', 'day', 'month', 'year')
 */
function determineTimeScope(startDate, endDate) {
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 2) {
        return 'hour';
    } else if (diffDays <= 90) {
        return 'day';
    } else if (diffDays <= 730) { // ~2 años
        return 'month';
    } else {
        return 'year';
    }
}

/**
 * Valida un rango de fechas
 *
 * @param {Date|string} startDate - Fecha de inicio
 * @param {Date|string} endDate - Fecha de fin
 * @param {Object} options - Opciones de validación
 * @param {number} options.maxDays - Número máximo de días permitido
 * @param {boolean} options.allowFuture - Si se permiten fechas futuras
 * @returns {boolean} - true si el rango es válido, false si no
 */
function validateDateRange(startDate, endDate, options = {}) {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return false;
    }

    // Verificar que la fecha de inicio es anterior a la de fin
    if (start > end) {
        return false;
    }

    // Verificar número máximo de días si se especifica
    if (options.maxDays !== undefined) {
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        if (diffDays > options.maxDays) {
            return false;
        }
    }

    // Verificar fechas futuras si no se permiten
    if (options.allowFuture === false) {
        const now = new Date();
        if (end > now) {
            return false;
        }
    }

    return true;
}

/**
 * Obtiene la fecha más reciente de un array de fechas
 *
 * @param {Array<Date|string>} dates - Array de fechas
 * @returns {Date} - Fecha más reciente
 */
function getMostRecentDate(dates) {
    if (!dates || !dates.length) {
        throw new Error('Dates array is empty or undefined');
    }

    // Convertir strings a Date si es necesario
    const dateDates = dates.map(d => d instanceof Date ? d : new Date(d));

    // Filtrar fechas inválidas
    const validDates = dateDates.filter(d => !isNaN(d.getTime()));

    if (validDates.length === 0) {
        throw new Error('No valid dates in array');
    }

    // Encontrar la fecha más reciente
    return new Date(Math.max(...validDates.map(d => d.getTime())));
}

/**
 * Compara dos fechas ignorando la hora
 *
 * @param {Date|string} date1 - Primera fecha
 * @param {Date|string} date2 - Segunda fecha
 * @returns {number} - -1 si date1 < date2, 0 si son iguales, 1 si date1 > date2
 */
function compareDatesIgnoringTime(date1, date2) {
    const d1 = date1 instanceof Date ? date1 : new Date(date1);
    const d2 = date2 instanceof Date ? date2 : new Date(date2);

    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
        throw new Error('Invalid date provided for comparison');
    }

    // Resetear horas para comparar solo las fechas
    const d1Date = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const d2Date = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());

    if (d1Date < d2Date) return -1;
    if (d1Date > d2Date) return 1;
    return 0;
}

module.exports = {
    formatDateForREEApi,
    formatDateISO,
    formatDateForUI,
    formatDate,
    parseDate,
    getDateRangeForPeriod,
    determineTimeScope,
    validateDateRange,
    getMostRecentDate,
    compareDatesIgnoringTime
};
