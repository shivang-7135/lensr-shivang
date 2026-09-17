FROM node:22-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

COPY --from=builder /app/.output ./.output

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", ".output/server/index.mjs"]
