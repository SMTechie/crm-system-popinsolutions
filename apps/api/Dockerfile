FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --include=dev
RUN npm install --no-save --prefix apps/api @nestjs/cli@12.0.0

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN cd apps/api && if [ -x node_modules/.bin/nest ]; then node_modules/.bin/nest build; else ../node_modules/.bin/nest build; fi

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
