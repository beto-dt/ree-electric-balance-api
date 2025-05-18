/**
 * @file jest.config.js
 * @description Configuración de Jest para pruebas unitarias e integradas
 *
 * Este archivo configura el framework de pruebas Jest para ejecutar
 * pruebas unitarias e integradas en la aplicación de balance eléctrico.
 */

module.exports = {
    // Directorio raíz para buscar archivos de prueba
    rootDir: '.',

    // Rutas a los directorios donde Jest debe buscar archivos de prueba
    roots: [
        '<rootDir>/src',
        '<rootDir>/tests'
    ],

    // Patrones de archivos para identficar archivos de prueba
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],

    // Patrones para ignorar al buscar archivos de prueba
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/coverage/',
        '/logs/'
    ],

    // Transformaciones para procesar archivos antes de las pruebas
    transform: {
        '^.+\\.js$': 'babel-jest'
    },

    // Extensiones de archivo que Jest debe considerar en las importaciones
    moduleFileExtensions: [
        'js',
        'json',
        'node'
    ],

    // Mapeo de nombres de módulos a rutas para importaciones
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1'
    },

    // Convertir rutas de cobertura en rutas relativas al directorio raíz
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/tests/',
        '/coverage/',
        '/dist/',
        '/logs/'
    ],

    // Establecer umbral de cobertura mínima (opcional)
    coverageThreshold: {
        global: {
            statements: 70,
            branches: 60,
            functions: 70,
            lines: 70
        },
        './src/domain/': {
            statements: 90,
            branches: 80,
            functions: 90,
            lines: 90
        }
    },

    // Configurar reporteros de cobertura
    coverageReporters: [
        'json',
        'lcov',
        'text',
        'clover',
        'html'
    ],

    // Directorio para reportes de cobertura
    coverageDirectory: '<rootDir>/coverage',

    // Colectar información de cobertura
    collectCoverage: process.env.COLLECT_COVERAGE === 'true',

    // Archivos para recopilar información de cobertura
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
        '!src/**/*.spec.js',
        '!src/**/__tests__/**',
        '!src/**/__mocks__/**'
    ],

    // Tiempo máximo de ejecución para cada prueba (en milisegundos)
    testTimeout: 30000,

    // Entorno global para pruebas
    testEnvironment: 'node',

    // Variables de entorno para pruebas
    setupFiles: ['<rootDir>/tests/setupEnv.js'],

    // Archivos a ejecutar después de cargar el entorno de pruebas
    setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],

    // Globalizar funciones comunes de prueba
    globals: {
        __DEV__: true
    },

    // Utilizar caché para mejorar rendimiento
    cache: true,

    // No salir ante el primer error
    bail: process.env.CI === 'true' ? 1 : 0,

    // Mostrar advertencias individuales para tests que tardan demasiado
    slowTestThreshold: 5, // segundos

    // Ejecutar todas las pruebas de forma secuencial en el mismo thread
    runInBand: process.env.RUN_IN_BAND === 'true',

    // Archivos de mocks globales
    modulePathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/dist/'
    ],

    // Configuración de verbose para mostrar resultados detallados
    verbose: process.env.VERBOSE === 'true',

    // Configuración de notificaciones
    notify: false,

    // Configuración de snapshotSerializers
    snapshotSerializers: [],

    // Carpetas donde buscar archivos de mocks
    moduleDirectories: [
        'node_modules',
        '<rootDir>/src',
        '<rootDir>/tests'
    ],

    // Reiniciar módulos falsificados antes de cada prueba
    resetMocks: true,

    // No restaurar automáticamente implementaciones falsificadas entre pruebas
    restoreMocks: false,

    // Eliminar automáticamente los módulos almacenados en caché antes de cada prueba
    resetModules: false,

    // Permitir pruebas de módulos nativos (como `fs` o `net`)
    forceExit: true,

    // Detectar archivos abiertos después de todas las pruebas
    detectOpenHandles: true,

    // Configuración para generar informes JUnit
    reporters: [
        'default',
        process.env.CI === 'true' ? ['jest-junit', {
            outputDirectory: './reports/junit',
            outputName: 'jest-junit.xml',
            classNameTemplate: '{classname}',
            titleTemplate: '{title}',
            ancestorSeparator: ' › ',
            usePathForSuiteName: true
        }] : null
    ].filter(Boolean),

    // Proyectos para configuración dividida de pruebas (opcional)
    projects: [
        {
            displayName: 'unit',
            testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
            testEnvironment: 'node'
        },
        {
            displayName: 'integration',
            testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
            testEnvironment: 'node',
            // Mayor timeout para pruebas de integración
            testTimeout: 60000
        }
    ]
};
