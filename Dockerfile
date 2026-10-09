# Interfaz web (J1): build estático de Vite. Solo el resultado (web/dist) pasa a la imagen final.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Backend: Node con TypeScript nativo, sin paso de build. Sirve web/dist en "/" (src/http/web.ts).
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
# Sin scripts: el postinstall (prisma generate) necesita el schema, que se copia después.
RUN npm ci --ignore-scripts

COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY --from=web /web/dist ./web/dist
# Para el servicio demo-preparar: seed y aprovisionamiento de Chatwoot.
COPY scripts ./scripts

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.ts"]
