# Local prototype image: builds both applications from the workspace.
# Not a security-reviewed production image.
FROM node:22.23.4-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --no-audit --no-fund
COPY . .
# Next rewrites are compiled at build time; API service is named 'api' in Compose.
ENV API_PROXY_TARGET=http://api:4000
RUN npm run build
EXPOSE 3000 4000
