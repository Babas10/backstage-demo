# Red Hat Developer Hub vs Standard Backstage — Differences & Fixes

This document records every difference, issue, and workaround encountered when
running the **metering plugin** (built for RHDH) on a standard Backstage
deployment. Both platforms run **Backstage 1.49.4**, so the differences are
not about the Backstage version — they are about how each platform **loads and
wires plugins**.

---

## 1. The Fundamental Difference — Plugin Loading Mechanism

This is the root cause of almost every issue below.

### Standard Backstage

Plugins are compiled directly into the monorepo and registered at build time
through `createApp()` from `@backstage/app-defaults`:

```typescript
// packages/app/src/App.tsx
const app = createApp({
  apis: [...],
  plugins: [catalogPlugin, myPlugin],
});
```

This uses the **old Backstage plugin system**. Even though Backstage 1.49 ships
the New Frontend System (NFS) alongside the old one, `createApp()` from
`@backstage/app-defaults` does NOT process NFS extensions (ApiBlueprint,
mountPoints, entityTabs, etc.). The two systems exist in parallel in the same
version.

### Red Hat Developer Hub

Plugins are **never compiled into the main RHDH image**. They live in
separate OCI images and are downloaded at pod startup by the
`install-dynamic-plugins` init container. The frontend is loaded via
**Scalprum/module federation** — a completely different loading path that
bypasses `createApp()` entirely and correctly processes NFS extensions.

```
RHDH plugin loading:
  OCI image → install-dynamic-plugins → dynamic-plugins-root volume → Scalprum

Standard Backstage plugin loading:
  Source code → yarn build → createApp() → bundle
```

**Consequence:** a plugin built with `createFrontendPlugin()` (NFS) works
perfectly in RHDH because Scalprum handles it. In standard Backstage, passing
the same plugin to `createApp({ plugins: [...] })` causes a silent runtime
crash.

---

## 2. Issues Encountered and Fixes Applied

### 2.1 White Screen — `meteringPlugin` in `createApp()`

**Symptom:** White screen immediately on load, no visible error in the UI.

**Root cause:** The metering plugin's `plugin.ts` uses `createFrontendPlugin()`
(NFS):

```typescript
// rhdh-plugins/metering/src/plugin.ts
export default createFrontendPlugin({
  pluginId: 'metering',
  extensions: [MeteringApiBlueprint],  // NFS extension
});
```

When this is passed to `createApp()` in standard Backstage, the old system
attempts to process it but doesn't understand `FrontendPlugin` objects — only
legacy `BackstagePlugin` objects. This causes a silent React crash.

**Fix:** Do NOT pass `meteringPlugin` to `createApp()`. Register only the API
factory and mount the components manually:

```typescript
// WRONG — crashes the old plugin system:
const app = createApp({
  plugins: [meteringPlugin],   // FrontendPlugin (NFS) ← crash
});

// CORRECT — API factory registered directly, components mounted manually:
const app = createApp({
  apis: [meteringApiFactory],  // plain createApiFactory() result ← works
  plugins: [catalogPlugin, userSettingsPlugin],  // only old-system plugins
});
```

The `MeteringSummaryCard` and `MeteringTabContent` components work as plain
React components regardless of the plugin system, so they can be mounted
directly in `App.tsx` without needing the plugin to be registered.

---

### 2.2 White Screen — `meteringApiFactory.factory()` not a function

**Symptom:** White screen after fixing 2.1, still no visible error.

**Root cause:** The initial `App.tsx` tried to call `.factory()` on the API
factory as if it were a class:

```typescript
// WRONG:
factory: ({ discoveryApi, fetchApi }) =>
  meteringApiFactory.factory({ discoveryApi, fetchApi })   // .factory is undefined!
```

`meteringApiFactory` is already the **output** of `createApiFactory()` — an
opaque descriptor object. It has no `.factory()` method. Calling it throws at
runtime, silently crashing React.

**Fix:** Pass `meteringApiFactory` directly to the `apis` array:

```typescript
// CORRECT:
const app = createApp({
  apis: [meteringApiFactory],   // pass the descriptor directly
  ...
});
```

---

### 2.3 `EntityLayout` child constraint

**Symptom:** `Error: Child of EntityLayout must be an EntityLayout.Route`

**Root cause:** The initial `App.tsx` wrapped a conditional route in
`EntitySwitch`:

```tsx
// WRONG — EntitySwitch is not an EntityLayout.Route:
<EntityLayout>
  <EntityLayout.Route path="/" title="Overview">...</EntityLayout.Route>
  <EntitySwitch>           {/* direct child of EntityLayout — crash! */}
    <EntitySwitch.Case if={hasK8sAnnotation}>
      <EntityLayout.Route path="/metering" title="Metering">...</EntityLayout.Route>
    </EntitySwitch.Case>
  </EntitySwitch>
</EntityLayout>
```

In `@backstage/plugin-catalog` v2.x, `EntityLayout` validates all direct
children at render time and throws if any are not `EntityLayout.Route`.

In RHDH this is handled via `entityTabs` in `dynamic-plugins.yaml` with an `if`
condition — the host app never sees the invalid child structure.

**Fix:** Always render the route unconditionally. The component handles the
missing-annotation case internally via `MeteringAnnotationGuard`:

```tsx
// CORRECT — all direct children are EntityLayout.Route:
<EntityLayout>
  <EntityLayout.Route path="/" title="Overview">...</EntityLayout.Route>
  <EntityLayout.Route path="/metering" title="Metering">
    <MeteringTabContent />  {/* renders MeteringAnnotationGuard if no annotation */}
  </EntityLayout.Route>
</EntityLayout>
```

---

### 2.4 Catalog API 401 Unauthorized

**Symptom:** App loads but every catalog API call returns 401.

**Root cause:** Two config issues combined:

1. The production overlay set `auth.environment: production` which overrides the
   base config's `dangerouslyAllowOutsideDevelopment: true`. Without it, the
   guest provider refuses to issue tokens for non-localhost origins.

2. Newer catalog plugins enforce backend auth by default. Even after the guest
   provider issued a token, the backend rejected it because
   `backend.auth.dangerouslyDisableDefaultAuthPolicy` was not set.

In RHDH this is not an issue because RHDH has its own fully configured auth
pipeline (Keycloak OIDC, backend secrets, etc.).

**Fix — `app-config.production.yaml`:**

```yaml
auth:
  environment: development          # keep development, not production
  providers:
    guest:
      dangerouslyAllowOutsideDevelopment: true   # required outside localhost

backend:
  auth:
    dangerouslyDisableDefaultAuthPolicy: true    # disable strict backend auth for demo
```

---

### 2.5 Prometheus `fetch failed` (TLS)

**Symptom:** `Metering API error (500): {"message":"fetch failed"}` when
opening the Metering tab.

**Root cause:** The `node:22-bookworm-slim` base image does **not** include the
OpenShift cluster CA certificate. When the Backstage backend tries to connect
to `https://prometheus-k8s.openshift-monitoring.svc:9091`, Node.js rejects the
self-signed TLS certificate with a `fetch failed` error.

In RHDH this is handled differently: RHDH's UBI-based image includes Red Hat
CA bundles, and the in-cluster Prometheus TLS is trusted automatically.

**Fix:** Set `NODE_TLS_REJECT_UNAUTHORIZED=0` in the Deployment:

```yaml
env:
  - name: NODE_TLS_REJECT_UNAUTHORIZED
    value: "0"
```

Note: this is acceptable for a demo but should not be used in production. The
proper fix would be to mount the cluster CA cert and configure Node.js to trust
it via `NODE_EXTRA_CA_CERTS`.

---

### 2.6 Prometheus Auth — SA Token vs Sealed Secret

**Symptom (RHDH):** Prometheus returned 401 even after granting `cluster-monitoring-view`.

**Root cause:** The RHDH operator sets `automountServiceAccountToken: false` on
the Backstage pod as a security hardening measure. The metering plugin's
`PrometheusClient` falls back to reading the SA token file at
`/var/run/secrets/kubernetes.io/serviceaccount/token` — which doesn't exist.

**RHDH fix:** Create a dedicated ServiceAccount, grant it `cluster-monitoring-view`,
create a long-lived token, seal it with Sealed Secrets, and inject it as
`METERING_PROMETHEUS_TOKEN`. Done via the post-install Ansible playbook tag
`--tags metering-prometheus-token`.

**Standard Backstage (this demo):** `automountServiceAccountToken` defaults to
`true`, so the SA token IS mounted. Only the RBAC grant is needed:

```yaml
# k8s/backstage-demo/rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: backstage-demo-cluster-monitoring-view
subjects:
  - kind: ServiceAccount
    name: default
    namespace: backstage-demo
roleRef:
  kind: ClusterRole
  name: cluster-monitoring-view
  apiGroup: rbac.authorization.k8s.io
```

No token sealing, no Ansible automation needed.

---

## 3. Summary Table

| Issue | Backstage behaviour | RHDH behaviour | Fix in Backstage |
|-------|--------------------|--------------|----|
| `createFrontendPlugin()` in `createApp()` | Silent crash (white screen) | Works via Scalprum | Don't pass NFS plugin to `createApp()` |
| API factory registration | Manual in `App.tsx` | Via `apiFactories` in `dynamic-plugins.yaml` | `apis: [meteringApiFactory]` |
| Conditional entity tab | `EntityLayout` v2 rejects non-Route children | `if` condition in `dynamic-plugins.yaml` | Remove `EntitySwitch` wrapper |
| Guest auth outside localhost | 401 on all API calls | Not applicable (uses Keycloak) | `dangerouslyAllowOutsideDevelopment: true` + `dangerouslyDisableDefaultAuthPolicy: true` |
| Prometheus TLS | `fetch failed` — no cluster CA in base image | Works — UBI image has Red Hat CA | `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| Prometheus auth | SA token auto-mounted, just needs RBAC | Token not mounted — needs sealed secret | `ClusterRoleBinding` to `default` SA |

---

## 4. What Did NOT Need to Change

The plugin's own source code (`rhdh-plugins/metering/` and
`rhdh-plugins/metering-backend/`) was **not modified** for this demo. Every
change was in:

- The host application (`packages/app/src/App.tsx`, `packages/backend/src/index.ts`)
- The deployment configuration (`k8s/backstage-demo/`, `app-config.production.yaml`)
- Kubernetes RBAC

This confirms that the plugin code is portable — only the **integration layer**
differs between the two platforms.

---

## 5. Build & Deployment Differences

| | RHDH | Standard Backstage |
|--|------|--------------------|
| Build output | `dist-dynamic/` + OCI image (~5 MB per plugin) | Full monolith Docker image (~800 MB – 1.5 GB) |
| Build tool | `rhdh-cli plugin package --tag <image>` | `docker build` (full Dockerfile) |
| CI time (plugin change) | ~2–3 min | ~15–45 min |
| Deploy mechanism | `install-dynamic-plugins` init container reads ConfigMap | `kubectl set image` or ArgoCD sync |
| Plugin update | No app rebuild — new plugin OCI image only | Full app rebuild + push + pod restart |
| Hot reload | Available for dev via `export-dev.sh` + rhdh-local | Not available |
