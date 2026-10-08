# Backend: Node con TypeScript nativo, sin paso de build.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
# Sin scripts: el postinstall (prisma generate) necesita el schema, que se copia después.
RUN npm ci --ignore-scripts

COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
# Para el servicio demo-preparar: seed y aprovisionamiento de Chatwoot.
COPY scripts ./scripts

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.ts"]
