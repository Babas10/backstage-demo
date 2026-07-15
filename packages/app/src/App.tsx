import React from 'react';
import { Navigate, Route } from 'react-router-dom';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import {
  CatalogEntityPage,
  CatalogIndexPage,
  catalogPlugin,
  EntityLayout,
  EntitySwitch,
  isKind,
} from '@backstage/plugin-catalog';
import { Grid } from '@material-ui/core';
import { userSettingsPlugin, UserSettingsPage } from '@backstage/plugin-user-settings';

// Metering plugin components — work as regular React components regardless of plugin system.
// Note: meteringPlugin (createFrontendPlugin/NFS) is intentionally NOT passed to createApp()
// because @backstage/app-defaults uses the old plugin system and mixing NFS plugins causes
// a runtime crash. The API factory and components are registered manually below.
import {
  MeteringSummaryCard,
  MeteringTabContent,
  meteringApiFactory,
} from '@internal/backstage-plugin-metering';

const K8S_NS_ANNOTATION = 'backstage.io/kubernetes-namespace';
const hasK8sAnnotation = (e: { metadata: { annotations?: Record<string, string> } }) =>
  Boolean(e.metadata.annotations?.[K8S_NS_ANNOTATION]);

// ── Entity page ─────────────────────────────────────────────────────────────

const componentEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3}>
        <EntitySwitch>
          <EntitySwitch.Case if={hasK8sAnnotation}>
            <Grid item xs={12} md={4}>
              <MeteringSummaryCard />
            </Grid>
          </EntitySwitch.Case>
        </EntitySwitch>
      </Grid>
    </EntityLayout.Route>

    <EntitySwitch>
      <EntitySwitch.Case if={hasK8sAnnotation}>
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
      <Grid container spacing={3} />
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
  // Register the metering API factory directly — meteringPlugin (NFS) is excluded
  // because createApp from @backstage/app-defaults uses the old plugin system.
  apis: [meteringApiFactory],
  plugins: [catalogPlugin, userSettingsPlugin],
});

export default app.createRoot(
  <AppRouter>
    <FlatRoutes>
      <Route path="/" element={<Navigate to="catalog" />} />
      <Route path="/catalog" element={<CatalogIndexPage />} />
      <Route path="/catalog/:namespace/:kind/:name" element={<CatalogEntityPage />}>
        {entityPage}
      </Route>
      <Route path="/settings" element={<UserSettingsPage />} />
    </FlatRoutes>
  </AppRouter>,
);
