# ----------------------
# Etapa de construcción
# ----------------------
FROM node:16-alpine AS builder

# Establecer directorio de trabajo
WORKDIR /app

# Instalar dependencias de sistema necesarias
RUN apk --no-cache add python3 make g++ curl

# Copiar archivos de configuración de npm
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# ----------------------
# Etapa de producción
# ----------------------
FROM node:16-alpine

# Etiquetas para metadatos de la imagen
LABEL maintainer="Tu Nombre <tu.email@ejemplo.com>"
LABEL description="API para balance eléctrico de REE con GraphQL"
LABEL version="1.0.0"

# Configurar variables de entorno
ENV NODE_ENV=production \
    PORT=4000 \
    TZ=Europe/Madrid

# Establecer directorio de trabajo
WORKDIR /app

# Instalar dependencias mínimas necesarias
RUN apk --no-cache add curl tzdata \
    && cp /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && apk del tzdata

# Crear usuario no privilegiado para ejecutar la aplicación
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Crear directorios necesarios y asignar permisos
RUN mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

# Copiar dependencias desde la etapa de construcción
COPY --from=builder /app/node_modules /app/node_modules

# Copiar código fuente de la aplicación
COPY --chown=nodejs:nodejs . .

# Ejecutar verificaciones de salud y permisos
RUN chmod +x /app/scripts/*.js && \
    npm --version && \
    node --version

# Exponer el puerto del servidor
EXPOSE $PORT

# Cambiar al usuario no privilegiado
USER nodejs

# Definir verificación de salud
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

# Punto de entrada y comando por defecto
ENTRYPOINT ["node"]
CMD ["src/index.js"]
