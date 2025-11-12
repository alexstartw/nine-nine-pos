# syntax=docker/dockerfile:1.5

FROM node:20-slim AS frontend-deps
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci

FROM frontend-deps AS frontend-builder
COPY frontend .
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build

FROM python:3.11-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=on \
    PYTHONPATH=/app/backend \
    FRONTEND_PORT=3000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    nginx && \
    rm -rf /var/lib/apt/lists/*

# Bring Node.js runtime from the builder image
COPY --from=frontend-builder /usr/local /usr/local

COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY backend/app ./backend/app

# Frontend standalone bundle + static assets
COPY --from=frontend-builder /frontend/.next/standalone ./frontend
COPY --from=frontend-builder /frontend/.next/static ./frontend/.next/static
COPY --from=frontend-builder /frontend/public ./frontend/public

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/start.sh /start.sh

RUN chmod +x /start.sh && \
    mkdir -p /app/data && \
    chown -R www-data:www-data /var/lib/nginx

EXPOSE 80
VOLUME ["/app/data"]

CMD ["/start.sh"]
