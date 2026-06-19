import React from 'react';
import type { AppTab } from '@/app/types';

export interface RouteContext {
  currentProjectId: string | null;
  currentEnvironment: string;
  projects: any[];
  projectsApi: any;
  settings: any[];
  settingsApi: any;
  environments: any[];
  environmentsApi: any;
  suites: any[];
  suitesApi: any;
  headers: any[];
  headersApi: any;
  bodies: any[];
  bodiesApi: any;
  endpoints: any[];
  endpointsApi: any;
  scopedSuites: any[];
  scopedHeaders: any[];
  scopedBodies: any[];
  scopedEndpoints: any[];
  setCurrentEnvironment: (env: string) => void;
  setCurrentProjectId: (id: string) => void;
  setExecutionState: (state: any) => void;
  navigateToTab: (tab: AppTab) => void;
}

type RouteComponent = React.ComponentType<any>;
type PropsFactory = (ctx: RouteContext) => Record<string, any>;

interface RouteEntry {
  tab: AppTab;
  component: RouteComponent;
  getProps: PropsFactory;
}

const registry = new Map<AppTab, RouteEntry>();

export function registerRoute(tab: AppTab, component: RouteComponent, getProps: PropsFactory): void {
  registry.set(tab, { tab, component, getProps });
}

export function renderRoute(tab: AppTab, ctx: RouteContext): React.ReactNode {
  const entry = registry.get(tab);
  if (!entry) return null;
  const props = entry.getProps(ctx);
  return React.createElement(entry.component, props);
}
