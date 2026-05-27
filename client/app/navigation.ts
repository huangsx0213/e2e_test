import {
  Activity,
  BarChart3,
  Database,
  FileCode,
  FileText,
  Globe,
  Layers,
  PlayCircle,
  PlaySquare,
  Settings,
  Workflow,
  BookOpen,
  Server,
  ClipboardList,
  GitBranchPlus,
  type LucideIcon,
} from 'lucide-react';
import { AppTab } from '@/app/types';

export interface NavigationItem {
  tab: AppTab;
  label: string;
  icon: LucideIcon;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

export const navigationSections: NavigationSection[] = [
  {
    title: 'Platform',
    items: [
      { tab: 'DASHBOARD', label: 'Dashboard', icon: Activity },
      { tab: 'RUN', label: 'Run Tests', icon: PlayCircle },
      { tab: 'TESTS', label: 'Test Designer', icon: PlaySquare },
      { tab: 'REPORTS', label: 'Test Reports', icon: BarChart3 },
      { tab: 'ELEMENTS', label: 'Object Repository', icon: Database },
      { tab: 'MODULES', label: 'Shared Modules', icon: Workflow },
      { tab: 'DYNAMIC_VARIABLES', label: 'Dynamic Variables', icon: Database },
    ],
  },
  {
    title: 'Infrastructure',
    items: [
{ tab: 'REQUIREMENTS', label: 'Requirements', icon: ClipboardList },
      { tab: 'BUSINESS_FLOWS', label: 'Business Flows', icon: GitBranchPlus },
      { tab: 'NL_CASES', label: 'NL Test Cases', icon: FileText },
      { tab: 'AI_TEST_GEN', label: 'AI Test Gen', icon: PlaySquare },
      { tab: 'AGENTS', label: 'Remote Agents', icon: Server },
    ],
  },
  {
    title: 'API Assets',
    items: [
      { tab: 'ENDPOINTS', label: 'Endpoints', icon: Globe },
      { tab: 'HEADERS', label: 'Headers', icon: FileText },
      { tab: 'BODIES', label: 'Body Templates', icon: FileCode },
    ],
  },
];

export const documentationNavigationItem: NavigationItem = {
  tab: 'DOCUMENTATION',
  label: 'Documentation',
  icon: BookOpen,
};

export const settingsNavigationItem: NavigationItem = {
  tab: 'SETTINGS',
  label: 'Settings',
  icon: Settings,
};

export const appBrand = {
  icon: Layers,
  primaryLabel: 'Quantum',
  accentLabel: 'QA',
};
