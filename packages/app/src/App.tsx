import React from 'react';
import { Navigate, Route } from 'react-router-dom';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import {
  CatalogEntityPage,
  CatalogIndexPage,
  catalogPlugin,
  EntityLayout,
  EntityOverviewPage,
  EntitySwitch,
  isKind,
} from '@backstage/plugin-catalog';
import { Grid } from '@material-ui/core';
import { userSettingsPlugin, UserSettingsPage } from '@backstage/plugin-user-settings';
import { catalogReactPlugin } from '@backstage/plugin-catalog-react';

import {
  MeteringSummaryCard,
  MeteringTabContent,
  meteringPlugin,
  meteringApiRef,
  meteringApiFactory,
} from '@internal/backstage-plugin-metering';
import { createApiFactory, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

// ── Entity page ────────────────────────────────────────────────────────────

const componentEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3} alignItems="stretch">
        <EntityOverviewPage />
        {/* Metering cost summary card — only on entities with k8s annotation */}
        <EntitySwitch>
          <EntitySwitch.Case
            if={e =>
              Boolean(e.metadata.annotations?.['backstage.io/kubernetes-namespace'])
            }
          >
            <Grid item xs={12} md={4}>
              <MeteringSummaryCard />
            </Grid>
          </EntitySwitch.Case>
        </EntitySwitch>
      </Grid>
    </EntityLayout.Route>

    {/* Metering tab — only on entities with k8s annotation */}
    <EntitySwitch>
      <EntitySwitch.Case
        if={e =>
          Boolean(e.metadata.annotations?.['backstage.io/kubernetes-namespace'])
        }
      >
        <EntityLayout.Route path="/metering" title="Metering">
          <MeteringTabContent />
        </EntityLayout.Route>
      </EntitySwitch.Case>
    </EntitySwitch>
  </EntityLayout>
);

const defaultEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <EntityOverviewPage />
    </EntityLayout.Route>
  </EntityLayout>
);

const entityPage = (
  <EntitySwitch>
    <EntitySwitch.Case if={isKind('component')} children={componentEntityPage} />
    <EntitySwitch.Case>{defaultEntityPage}</EntitySwitch.Case>
  </EntitySwitch>
);

// ── App ─────────────────────────────────────────────────────────────────────

const app = createApp({
  apis: [
    createApiFactory({
      api: meteringApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        meteringApiFactory.factory({ discoveryApi, fetchApi }),
    }),
  ],
  plugins: [
    catalogPlugin,
    catalogReactPlugin,
    userSettingsPlugin,
    meteringPlugin,
  ],
});

export default app.createRoot(
  <AppRouter>
    <FlatRoutes>
      <Route path="/" element={<Navigate to="catalog" />} />
      <Route path="/catalog" element={<CatalogIndexPage />} />
      <Route
        path="/catalog/:namespace/:kind/:name"
        element={<CatalogEntityPage />}
      >
        {entityPage}
      </Route>
      <Route path="/settings" element={<UserSettingsPage />} />
    </FlatRoutes>
  </AppRouter>,
);
