/**
 * Backstage Demo — Backend
 *
 * This is a standard Backstage monolithic backend. When the metering plugin
 * changes, the ENTIRE image (this file + all dependencies) must be rebuilt:
 *   1. yarn install     (~5–10 min)
 *   2. yarn build       (~15–30 min, TypeScript + webpack)
 *   3. docker build     (~5–10 min, assembles ~1.5 GB image)
 *   4. docker push      (~3–8 min, uploads ~1.5 GB)
 *
 * Compare this to Red Hat Developer Hub where a plugin change only requires
 * rebuilding and pushing the ~5 MB plugin OCI image (~1–2 min total).
 */
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// Core Backstage capabilities
backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'));
backend.add(import('@backstage/plugin-proxy-backend'));
backend.add(import('@backstage/plugin-search-backend'));
backend.add(import('@backstage/plugin-search-backend-module-catalog'));

// Additional enterprise plugins
backend.add(import('@backstage/plugin-kubernetes-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-techdocs-backend'));
backend.add(import('@backstage/plugin-permission-backend'));
backend.add(import('@backstage/plugin-permission-backend-module-allow-all-policy'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// Metering plugin — installed as a regular npm workspace package.
// In standard Backstage, updating this plugin triggers a full image rebuild.
backend.add(import('@internal/backstage-plugin-metering-backend'));

backend.start();
