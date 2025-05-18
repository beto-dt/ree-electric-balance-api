# Electric Balance API



## 📋 Prerequisitos

- Node.js (v16 o superior)
- MongoDB
- npm

## 🔧 Instalación

1. **Clonar el repositorio**
```bash
git clone git@github.com:beto-dt/ree-electric-balance-api.git
cd electric-balance-api
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
   Crear archivo `.env` en la raíz del proyecto:
```env
# Entorno
NODE_ENV=development

# Servidor
PORT=4000
HOST=localhost
BASE_URL=http://localhost:4000
CORS_ENABLED=true
CORS_ORIGINS=*
TRUST_PROXY=false
REQUEST_TIMEOUT=60000
BODY_LIMIT=10mb

# MongoDB
MONGODB_URI=mongodb://localhost:27017/electric-balance
MONGODB_DB_NAME=electric-balance
MONGODB_USER= admin
MONGODB_PASSWORD= pass
MONGODB_AUTH_SOURCE=admin
MONGODB_POOL_SIZE=10
MONGODB_TIMEOUT=30000
MONGODB_SOCKET_TIMEOUT=45000
MONGODB_IP_FAMILY=4

# API de REE
REE_API_BASE_URL=https://apidatos.ree.es
REE_API_TIMEOUT=10000
REE_API_RETRY_ATTEMPTS=3
REE_API_RETRY_DELAY=1000
REE_API_HEADERS={}

# Tareas programadas
SCHEDULED_TASKS_ENABLED=true
SCHEDULED_TASKS_TIMEZONE=Europe/Madrid
HOURLY_FETCH_CRON=0 */1 * * *
DAILY_FETCH_CRON=0 4 * * *
MONTHLY_FETCH_CRON=0 5 1 * *
INITIAL_FETCH_ENABLED=true
HISTORICAL_HOURS_DAYS=2
HISTORICAL_DAYS_DAYS=60
HISTORICAL_MONTHS_DAYS=365
HISTORICAL_YEARS_DAYS=1825

# GraphQL
GRAPHQL_PATH=/graphql
GRAPHQL_INTROSPECTION=true
GRAPHQL_PLAYGROUND=true
GRAPHQL_DEBUG=true
GRAPHQL_TRACING=false
GRAPHQL_MAX_DEPTH=10
GRAPHQL_MAX_COMPLEXITY=1000

# Apollo Server
APOLLO_REPORTING_ENABLED=false

# Logging
LOG_LEVEL=info
LOG_PRETTY_PRINT=true
LOG_ENABLE_CONSOLE=true
LOG_ENABLE_FILE=false
LOG_FILE_PATH=./logs/app.log
LOG_EXCLUDE_PATHS=/health,/metrics,/favicon.ico

# Cache
CACHE_ENABLED=true
CACHE_TTL=300
CACHE_MAX_ITEMS=1000

```

## 🏃‍♂️ Ejecutar el proyecto  localmente con Docker

```bash

1. npm run docker:build

2. npm run docker:up

3.- Revisamor Docker En Container donde observaremos que ya se nos creo la base de datos , api y frontend

Observacion 

Debemos tener en la misma carpeta los dos proyectos tanto BackEnd como FrontEnd para que se levante con docker

```

## 🏃‍♂️ Ejecutar el proyecto  localmente sin Docker

```bash

1. npm run start

```

## 🏃‍♂️ Ejemplos para probar los Scripts


```bash


node scripts/testREEApi.js --start 2025-05-05 --end 2025-05-20 --detail --analyze

node scripts/seedDatabase.js --start 2025-05-05 --end 2025-05-20 --time-scope day --verbose --dry-run

node scripts/seedDatabase.js --start 2019-01-01 --end 2019-01-31 --time-scope day --verbose

```


## 🏃‍♂️ Enpoint del BackEnd ya subido en el servidor 


```bash


https://ree-electric-balance-api.onrender.com/

https://ree-electric-balance-api.onrender.com/graphql


```

## ✒️ Autor

* **Luis Alberto De La Torre** - *Desarrollo Inicial* - [beto-dt](https://github.com/beto-dt)




