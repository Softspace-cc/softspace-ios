FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --include=dev

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV RELEASES_DIR=/data/releases
RUN apk add --no-cache openssl tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY package.json ./
RUN mkdir -p /data/uploads /data/releases/windows && chown -R node:node /data /app
USER node
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
