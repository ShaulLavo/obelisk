# Vibe Web - Multi-stage build
# Stage 1: Build
FROM oven/bun:1.2.22 AS builder

# Install git (needed for icons build to fetch icon packs)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files
COPY package.json bun.lock* ./
COPY turbo.json ./

# Copy all workspace packages (needed for monorepo build)
COPY packages ./packages
COPY apps ./apps

# Install all dependencies (skip postinstall to avoid tree-sitter path issues)
RUN bun install --ignore-scripts

# Run tree-sitter asset copy manually (handles hoisted node_modules)
RUN bun run --cwd apps/web copy-tree-sitter-assets

# Build submodules first (icons, sqlite-wasm, just-bash)
# Clean up icons cache after build to save disk space (icons source repos are large)
RUN bun run build:submodules && rm -rf packages/icons/.cache

# Build the web app - try with explicit vite call for better error output
RUN cd apps/web && bunx vite build --logLevel info 2>&1 || (echo "===== BUILD FAILED =====" && cat /app/apps/web/node_modules/.vite-error.log 2>/dev/null || true && exit 1)

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# SPA fallback - all routes serve index.html
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|wasm)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
