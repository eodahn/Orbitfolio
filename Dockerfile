FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
COPY server ./server
COPY shared ./shared
COPY database ./database
COPY scripts ./scripts
# Development seed module is imported but disabled in production.
COPY src/mocks ./src/mocks
COPY src/utils ./src/utils
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
