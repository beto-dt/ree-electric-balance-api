module.exports = {
    env: {
        node: true,
        es2021: true,
        jest: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:node/recommended',
        'plugin:security/recommended',
        'plugin:promise/recommended',
        'plugin:prettier/recommended',
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    plugins: [
        'node',
        'security',
        'promise',
        'prettier',
        'jest',
    ],
    rules: {
        // Posibles errores
        'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
        'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
        'no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_'
        }],
        'no-constant-condition': ['error', { checkLoops: false }],

        // Mejores prácticas
        'array-callback-return': 'error',
        'block-scoped-var': 'error',
        'complexity': ['warn', { max: 15 }],
        'consistent-return': 'error',
        'default-case': 'error',
        'dot-notation': 'error',
        'eqeqeq': ['error', 'always', { null: 'ignore' }],
        'no-alert': 'error',
        'no-else-return': ['error', { allowElseIf: false }],
        'no-empty-function': ['error', { allow: ['arrowFunctions'] }],
        'no-eval': 'error',
        'no-extend-native': 'error',
        'no-extra-bind': 'error',
        'no-loop-func': 'error',
        'no-new': 'error',
        'no-new-func': 'error',
        'no-new-wrappers': 'error',
        'no-param-reassign': ['error', { props: false }],
        'no-return-await': 'error',
        'no-self-compare': 'error',
        'no-useless-concat': 'error',
        'no-useless-return': 'error',
        'require-await': 'error',
        'yoda': 'error',

        // Estilo y formateo
        'camelcase': ['error', {
            properties: 'never',
            ignoreDestructuring: true,
            ignoreImports: true,
            ignoreGlobals: true,
        }],
        'comma-dangle': ['error', {
            arrays: 'always-multiline',
            objects: 'always-multiline',
            imports: 'always-multiline',
            exports: 'always-multiline',
            functions: 'never',
        }],
        'func-names': ['error', 'as-needed'],
        'max-depth': ['warn', 4],
        'max-len': ['warn', {
            code: 100,
            tabWidth: 2,
            comments: 120,
            ignorePattern: '^import\\s.+\\sfrom\\s.+;$',
            ignoreUrls: true,
            ignoreStrings: true,
            ignoreTemplateLiterals: true,
            ignoreRegExpLiterals: true,
        }],
        'max-lines': ['warn', {
            max: 500,
            skipBlankLines: true,
            skipComments: true,
        }],
        'max-lines-per-function': ['warn', {
            max: 150,
            skipBlankLines: true,
            skipComments: true,
            IIFEs: true,
        }],
        'max-nested-callbacks': ['warn', 4],
        'max-params': ['warn', 5],
        'no-lonely-if': 'error',
        'no-nested-ternary': 'error',
        'no-unneeded-ternary': 'error',
        'prefer-const': 'error',
        'prefer-destructuring': ['error', {
            array: true,
            object: true,
        }, {
            enforceForRenamedProperties: false,
        }],
        'prefer-template': 'error',
        'spaced-comment': ['error', 'always'],

        // ES6+
        'arrow-body-style': ['error', 'as-needed'],
        'no-duplicate-imports': 'error',
        'no-useless-computed-key': 'error',
        'no-useless-constructor': 'error',
        'no-useless-rename': 'error',
        'no-var': 'error',
        'object-shorthand': ['error', 'always'],
        'prefer-rest-params': 'error',
        'prefer-spread': 'error',
        'symbol-description': 'error',

        // Node.js específico
        'node/exports-style': ['error', 'module.exports'],
        'node/file-extension-in-import': ['error', 'never'],
        'node/prefer-global/buffer': ['error', 'always'],
        'node/prefer-global/console': ['error', 'always'],
        'node/prefer-global/process': ['error', 'always'],
        'node/prefer-promises/dns': 'error',
        'node/prefer-promises/fs': 'error',
        'node/no-unpublished-require': 'off',
        'node/no-unsupported-features/es-syntax': 'off',

        // Seguridad
        'security/detect-object-injection': 'warn',
        'security/detect-non-literal-regexp': 'warn',
        'security/detect-non-literal-require': 'warn',
        'security/detect-possible-timing-attacks': 'warn',

        // Promesas
        'promise/always-return': 'warn',
        'promise/no-return-wrap': 'error',
        'promise/param-names': 'error',
        'promise/catch-or-return': 'error',
        'promise/no-native': 'off',
        'promise/no-nesting': 'warn',
        'promise/no-promise-in-callback': 'warn',
        'promise/no-callback-in-promise': 'warn',
        'promise/avoid-new': 'off',
        'promise/no-new-statics': 'error',
        'promise/no-return-in-finally': 'warn',
        'promise/valid-params': 'warn',

        // Jest
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/no-identical-title': 'error',
        'jest/prefer-to-have-length': 'warn',
        'jest/valid-expect': 'error',

        // Prettier
        'prettier/prettier': ['error', {
            singleQuote: true,
            trailingComma: 'es5',
            printWidth: 100,
            tabWidth: 2,
            semi: true,
            bracketSpacing: true,
            arrowParens: 'avoid',
        }],
    },
    overrides: [
        {
            // Configuración específica para archivos de test
            files: ['**/*.test.js', '**/*.spec.js', 'tests/**/*.js'],
            env: {
                jest: true,
            },
            rules: {
                'max-lines-per-function': 'off',
                'max-lines': 'off',
                'max-nested-callbacks': 'off',
                'no-unused-expressions': 'off',
            },
        },
        {
            // Configuración específica para scripts
            files: ['scripts/**/*.js'],
            rules: {
                'no-console': 'off',
                'node/shebang': 'off',
            },
        },
        {
            // Configuración específica para archivos de configuración
            files: ['.eslintrc.js', '*.config.js'],
            rules: {
                'node/no-unpublished-require': 'off',
            },
        },
    ],
    settings: {
        'node': {
            tryExtensions: ['.js', '.json', '.node'],
        },
    },
};
