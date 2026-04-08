FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install --workspaces --include-workspace-root
COPY . .
RUN npm run build --workspace @kagu/contracts && npm run build --workspace @kagu/web

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/public ./apps/web/public
ENV NODE_ENV=production
CMD ["node_modules/.bin/next", "start", "apps/web"]
