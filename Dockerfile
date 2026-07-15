# =============================================================================
# Backstage Demo — Multi-stage Docker build
# =============================================================================
#
# DEMO NOTE: This Dockerfile illustrates the "traditional Backstage" approach
# where every plugin change triggers a FULL image rebuild:
#
#   Stage 1 (build)   yarn install + yarn build    ~10–30 min
#   Stage 2 (runtime) final image assembly         ~2–5 min
#   docker push                                    ~2–5 min
#   pod restart + image pull                       ~1–2 min
#
#   TOTAL per plugin change:  15–45 minutes
#
# Compare with Red Hat Developer Hub dynamic plugins:
#   rhdh-cli plugin package --tag <image>          ~1–2 min
#   docker push (tiny ~5 MB plugin OCI image)      ~30 s
#   pod restart + install-dynamic-plugins          ~1–2 min
#
#   TOTAL per plugin change:  2–4 minutes
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# Node 20 is the LTS version supported by Backstage 1.49.x
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Copy workspace manifests first for better layer caching.
# This layer is invalidated only when dependencies change, not on source changes.
COPY package.json yarn.lock backstage.json .yarnrc.yml ./
COPY packages/backend/package.json packages/backend/
COPY packages/app/package.json        packages/app/
COPY plugins/metering/package.json    plugins/metering/
COPY plugins/metering-backend/package.json plugins/metering-backend/

# Install ALL dependencies (dev + prod) — this is the slowest step.
# In a real project this downloads hundreds of packages and can take 5–10 min.
RUN yarn install --immutable

# Copy source
COPY . .

# Compile TypeScript and bundle the backend.
# The backend build also includes the frontend static assets via
# @backstage/plugin-app-backend serving the compiled React app.
RUN yarn build:backend --config app-config.yaml
RUN yarn workspace app build

# -----------------------------------------------------------------------------
# Stage 2: Runtime
# Thin production image — no dev tools, no source files
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Copy only what is needed to run
COPY --from=build /app/yarn.lock        ./yarn.lock
COPY --from=build /app/package.json     ./package.json
COPY --from=build /app/.yarnrc.yml      ./.yarnrc.yml
COPY --from=build /app/app-config*.yaml ./
# The backend build outputs a self-contained tarball that includes all plugins
COPY --from=build /app/packages/backend/dist/bundle.tar.gz ./

# Extract the bundle
RUN tar xzf bundle.tar.gz && rm bundle.tar.gz

# Install production-only dependencies (removes dev packages, reduces image size)
# Even so, the final image is typically 800 MB – 1.5 GB because Node.js
# production dependencies for a full Backstage app are substantial.
COPY --from=build /app/node_modules ./node_modules

# OpenShift runs pods as a random UID in the root group — ensure /app is writable
RUN chown -R 65532:0 /app && chmod -R g=u /app

# Use a non-root user for security
USER 65532

EXPOSE 7007

CMD ["node", "packages/backend", \
     "--config", "app-config.yaml", \
     "--config", "app-config.production.yaml"]
