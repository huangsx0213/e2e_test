import type { ComponentType } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  appBrand,
  navigationSections,
  documentationNavigationItem,
  settingsNavigationItem,
} from "@/app/navigation";
import { AppTab } from "@/app/types";

interface AppSidebarProps {
  activeTab: AppTab;
  isCollapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  onTabChange: (tab: AppTab) => void;
}

export function AppSidebar({
  activeTab,
  isCollapsed,
  onCollapseChange,
  onTabChange,
}: AppSidebarProps) {
  const BrandIcon = appBrand.icon;

  return (
    <nav
      className={`${isCollapsed ? "w-16" : "w-64"} z-20 flex shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 transition-all duration-300`}
    >
      <div
        className={`flex h-14 items-center border-b border-slate-800/50 ${isCollapsed ? "justify-center px-0" : "justify-between px-4"}`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden font-semibold tracking-tight text-white">
          <div className="shrink-0 rounded-md bg-blue-600 p-1.5">
            <BrandIcon className="fill-white/20 text-white" size={18} />
          </div>
          {!isCollapsed && (
            <span className="truncate">
              {appBrand.primaryLabel}
              <span className="font-normal text-blue-400">
                {appBrand.accentLabel}
              </span>
            </span>
          )}
        </div>
        {!isCollapsed && (
          <button
            onClick={() => onCollapseChange(true)}
            className="shrink-0 text-slate-400 transition-colors hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      {isCollapsed && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => onCollapseChange(false)}
            className="p-1 text-slate-400 transition-colors hover:text-white"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      <div className="mt-2 overflow-x-hidden overflow-y-auto p-3 space-y-0.5">
        {navigationSections.map((section) => (
          <div key={section.title}>
            {isCollapsed ? (
              <div className="mx-2 my-2 h-px bg-slate-800" />
            ) : (
              <div className="mb-2 px-3 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {section.title}
              </div>
            )}

            {section.items.map((item) => (
              <div key={item.tab}>
                <SidebarNavItem
                  icon={item.icon}
                  label={item.label}
                  active={activeTab === item.tab}
                  collapsed={isCollapsed}
                  onClick={() => onTabChange(item.tab)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-slate-800 p-3 space-y-0.5">
        <SidebarNavItem
          icon={documentationNavigationItem.icon}
          label={documentationNavigationItem.label}
          active={activeTab === documentationNavigationItem.tab}
          collapsed={isCollapsed}
          onClick={() => onTabChange(documentationNavigationItem.tab)}
        />

        <SidebarNavItem
          icon={settingsNavigationItem.icon}
          label={settingsNavigationItem.label}
          active={activeTab === settingsNavigationItem.tab}
          collapsed={isCollapsed}
          onClick={() => onTabChange(settingsNavigationItem.tab)}
        />

        {!isCollapsed ? (
          <div className="mt-3 flex items-center gap-3 overflow-hidden rounded-md border border-slate-800 bg-slate-800/50 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-blue-500/30 bg-blue-500/20 text-xs font-bold text-blue-400">
              QA
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium text-slate-200">
                QA Engineer
              </span>
              <span className="truncate text-[10px] text-slate-500">
                admin@company.com
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex justify-center">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-blue-500/30 bg-blue-500/20 text-xs font-bold text-blue-400"
              title="QA Engineer"
            >
              QA
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

interface SidebarNavItemProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function SidebarNavItem({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
}: SidebarNavItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`group flex w-full items-center rounded-md py-2 text-sm font-medium transition-all duration-200 ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${active ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" : "text-slate-400 hover:bg-slate-800/50 hover:text-white"}`}
    >
      <Icon
        size={18}
        className={
          active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
        }
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
