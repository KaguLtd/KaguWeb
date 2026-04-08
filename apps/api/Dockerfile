FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install --workspaces --include-workspace-root
COPY . .
RUN npm run build --workspace @kagu/contracts && npm run prisma:generate --workspace @kagu/api && npm run build --workspace @kagu/api

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/main.js"]

