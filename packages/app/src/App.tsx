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
import { orgPlugin } from '@backstage/plugin-org';
import { TechRadarPage, techRadarPlugin } from '@backstage/plugin-tech-radar';
import { ScaffolderPage, scaffolderPlugin } from '@backstage/plugin-scaffolder';
import {
  TechDocsIndexPage,
  TechDocsReaderPage,
  techdocsPlugin,
} from '@backstage/plugin-techdocs';

// Metering plugin
import {
  MeteringSummaryCard,
  MeteringTabContent,
  meteringApiFactory,
} from '@internal/backstage-plugin-metering';

// Enterprise plugins installed but not imported to avoid export-name incompatibilities.
// They are present in node_modules, contributing to yarn install and TypeScript
// compilation time — which is the realistic enterprise scenario.
// @backstage/plugin-kubernetes, @backstage-community/plugin-catalog-graph,
// @backstage-community/plugin-github-actions, plugin-sonarqube,
// plugin-azure-devops, plugin-jenkins, plugin-dynatrace, plugin-adr,
// plugin-badges, plugin-cost-insights, plugin-lighthouse, plugin-sentry,
// plugin-todo, plugin-kafka, plugin-newrelic-dashboard, plugin-graphiql,
// plugin-code-coverage, plugin-github-pull-requests-board

const K8S_NS_ANNOTATION = 'backstage.io/kubernetes-namespace';
const hasK8sAnnotation = (e: { metadata: { annotations?: Record<string, string> } }) =>
  Boolean(e.metadata.annotations?.[K8S_NS_ANNOTATION]);

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
    <EntityLayout.Route path="/metering" title="Metering">
      <MeteringTabContent />
    </EntityLayout.Route>
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

const app = createApp({
  apis: [meteringApiFactory],
  plugins: [
    catalogPlugin,
    userSettingsPlugin,
    orgPlugin,
    techRadarPlugin,
    scaffolderPlugin,
    techdocsPlugin,
  ],
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
      <Route path="/tech-radar" element={<TechRadarPage />} />
      <Route path="/create" element={<ScaffolderPage />} />
      <Route path="/docs" element={<TechDocsIndexPage />} />
      <Route path="/docs/:namespace/:kind/:name/*" element={<TechDocsReaderPage />} />
    </FlatRoutes>
  </AppRouter>,
);
