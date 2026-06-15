FROM node:22-bookworm-slim AS deps

WORKDIR /app

ENV NODE_OPTIONS=--experimental-sqlite

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NODE_OPTIONS=--experimental-sqlite
ARG NEXT_PUBLIC_ICP_BEIAN=
ENV NEXT_PUBLIC_ICP_BEIAN=${NEXT_PUBLIC_ICP_BEIAN}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-sqlite
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN sed -i \
    -e 's|http://deb.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' \
    -e 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' \
    /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends prusa-slicer \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

RUN mkdir -p /app/data /app/uploads /app/profiles /app/gcode

EXPOSE 3000

CMD ["npm", "start"]
