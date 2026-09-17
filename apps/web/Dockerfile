FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --include=dev
RUN npm install --no-save --prefix apps/web next@16.3.3

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN cd apps/web && if [ -x node_modules/.bin/next ]; then node_modules/.bin/next build; else ../node_modules/.bin/next build; fi

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/web"]
