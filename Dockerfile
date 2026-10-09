# Cuatro objetivos (`docker build --target <nombre>`):
#   demo        el que usa docker compose (la demo local): backend + CLI de Prisma + scripts (demo-preparar migra y siembra con ellos).
#   migrar      tarea PUNTUAL de cada despliegue en AWS: aplica las migraciones y prepara la cuenta de base de datos de la aplicación.
#   produccion  el servicio: SIN la CLI de Prisma (K3: quita las 4 vulnerabilidades altas transitivas de su cadena), sin dependencias de desarrollo,
#               sin shell de compilación, con un usuario sin privilegios. Es el último: lo que se construye sin `--target`.

# Interfaz web (J1): build estático de Vite. Solo el resultado (web/dist) pasa a la imagen final.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Base común: todo el código, el cliente de Prisma generado y la CLI (solo para generar).
FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
# Sin scripts: el postinstall (prisma generate) necesita el schema, que se copia después.
RUN npm ci --ignore-scripts

COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY --from=web /web/dist ./web/dist
COPY scripts ./scripts

# ── Demo local ──
FROM base AS demo
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.ts"]

# ── Migración (AWS) ──
FROM base AS migrar
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/preparar-roles.ts"]

# ── Producción ──
FROM node:22-alpine AS produccion
WORKDIR /app

COPY package.json package-lock.json ./
# Solo lo que el servicio ejecuta. `--omit=optional` quita también la CLI de Prisma, que npm deja como dependencia opcional de @prisma/client.
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

COPY --from=base /app/src ./src
COPY --from=base /app/web/dist ./web/dist
# Para la lectura «las migraciones están al día» (/salud/lista) y la cuadratura diaria; no hay nada más que el servicio necesite.
COPY --from=base /app/prisma/migrations ./prisma/migrations
COPY --from=base /app/scripts/cuadratura.ts ./scripts/cuadratura.ts

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "src/server.ts"]
