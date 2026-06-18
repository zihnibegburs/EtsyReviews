# ---- base ----
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# ---- deps ----
FROM base AS deps
# If you use npm:
COPY package.json package-lock.json* ./
RUN npm ci

# If you use pnpm or yarn, swap the lines above accordingly.

# ---- builder ----
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client before build
RUN npx prisma generate

# Build Next.js (standalone output = minimal runtime image)
RUN npm run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Ensure TZ if you need it:
# ENV TZ=Etc/UTC

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy standalone server, static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Prisma schema isn’t required at runtime, but keep it if you run migrate in container:
COPY --from=builder /app/prisma ./prisma

# Optional: entry script to run migrations before starting
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs

# Next standalone server.js listens on PORT (defaults 3000)
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["./entrypoint.sh"]
# Fallback (if you don't want migrations):
# CMD ["node", "server.js"]
