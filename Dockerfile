FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM php:8.3-apache-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libonig-dev libcurl4-openssl-dev && docker-php-ext-install pdo_mysql mbstring curl && rm -rf /var/lib/apt/lists/*
WORKDIR /var/www/orbitfolio
COPY backend ./backend
COPY --from=frontend /app/dist ./dist
COPY deploy/apache.conf /etc/apache2/sites-available/000-default.conf
COPY deploy/start-php.sh /usr/local/bin/start-orbitfolio
RUN a2enmod rewrite && chmod +x /usr/local/bin/start-orbitfolio
EXPOSE 10000
CMD ["start-orbitfolio"]
