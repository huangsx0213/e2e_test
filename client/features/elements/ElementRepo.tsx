import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MutationActions } from "@/shared/hooks/useQueryHooks";
import { queryKeys } from "@/shared/hooks/queryKeys";
import { Project, Page, UIElement, SelectorType } from "@/shared/types";
import {
  Trash2,
  Plus,
  Database,
  File,
  Edit2,
  Check,
  Layout,
  Code,
  ChevronRight,
  ChevronDown,
  MousePointer2,
  MoreHorizontal,
  Search,
  Filter,
  FolderPlus,
  Settings,
  Video,
  Square,
  RefreshCw,
} from "lucide-react";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";
import { ExecutionTargetSelector } from "@/shared/ui/ExecutionTargetSelector";

interface ElementRepoProps {
  projects: Project[];
  projectsApi: MutationActions<Project>;
  currentProjectId: string;
}

export const ElementRepo: React.FC<ElementRepoProps> = ({
  projects,
  projectsApi,
  currentProjectId,
}) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activePageId, setActivePageId] = useState<string>("");
  const [activeElementId, setActiveElementId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");


  // Recording States
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingTargetId, setRecordingTargetId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Edit States
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editPageName, setEditPageName] = useState("");

  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editElementName, setEditElementName] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "page" | "element";
    id: string;
    pageId?: string;
  } | null>(null);

  const activeProject = projects.find((p) => p.id === currentProjectId);
  const activePage = activeProject?.pages.find((p) => p.id === activePageId);
  const activeElement = activePage?.elements.find(
    (e) => e.id === activeElementId,
  );


  // Handle Project Selection Reset on Delete
  useEffect(() => {
    if (!activeProject) {
      setActivePageId("");
      setActiveElementId("");
    } else if (
      activePageId &&
      !activeProject.pages.find((p) => p.id === activePageId)
    ) {
      setActivePageId("");
      setActiveElementId("");
    }
  }, [activeProject, activePageId]);

  // Filter Logic
  const filteredPages = useMemo(() => {
    if (!activeProject) return [];
    if (!searchTerm) return activeProject.pages;
    const lower = searchTerm.toLowerCase();
    return activeProject.pages
      .map((p) => ({
        ...p,
        elements: p.elements.filter(
          (e) =>
            e.name.toLowerCase().includes(lower) ||
            e.value.toLowerCase().includes(lower),
        ),
      }))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.elements.length > 0 ||
          activeProject.pages
            .find((orig) => orig.id === p.id)
            ?.name.toLowerCase()
            .includes(lower),
      );
  }, [activeProject, searchTerm]);

  // --- Page Actions ---

  const updateProject = (fn: (p: Project) => Project) => {
    const project = projects.find((p) => p.id === currentProjectId);
    if (project) {
      projectsApi.update(currentProjectId, fn(project));
    }
  };


  const addPage = () => {
    if (!activeProject) return;
    const newPage: Page = {
      id: `pg-${Date.now()}`,
      name: "New Page",
      description: "",
      elements: [],
    };
    updateProject((p) => ({ ...p, pages: [...p.pages, newPage] }));
    setActivePageId(newPage.id);
    setActiveElementId("");
    // Auto Enter Edit Mode
    setEditingPageId(newPage.id);
    setEditPageName("New Page");
  };

  const savePageName = () => {
    if (editingPageId) {
      updateProject((p) => ({
        ...p,
        pages: p.pages.map((pg) =>
          pg.id === editingPageId ? { ...pg, name: editPageName } : pg,
        ),
      }));
      setEditingPageId(null);
    }
  };

  const updatePage = (pageId: string, updates: Partial<Page>) => {
    updateProject((p) => ({
      ...p,
      pages: p.pages.map((pg) =>
        pg.id === pageId ? { ...pg, ...updates } : pg,
      ),
    }));
  };

  const deletePage = (pageId: string) => {
    // Immediate deletion without confirmation
    updateProject((p) => ({
      ...p,
      pages: p.pages.filter((pg) => pg.id !== pageId),
    }));
    if (activePageId === pageId) {
      setActivePageId("");
      setActiveElementId("");
    }
  };

  // --- Element Actions ---

  const addElement = (pageId: string) => {
    const newElement: UIElement = {
      id: `el-${Date.now()}`,
      name: "New Element",
      selectorType: "CSS",
      value: "",
      description: "",
    };
    updateProject((p) => ({
      ...p,
      pages: p.pages.map((pg) => {
        if (pg.id !== pageId) return pg;
        return { ...pg, elements: [...pg.elements, newElement] };
      }),
    }));
    setActivePageId(pageId);
    setActiveElementId(newElement.id);
    // Auto Enter Edit Mode
    setEditingElementId(newElement.id);
    setEditElementName("New Element");
  };

  const updateElement = (
    pageId: string,
    elementId: string,
    updates: Partial<UIElement>,
  ) => {
    updateProject((p) => ({
      ...p,
      pages: p.pages.map((pg) => {
        if (pg.id !== pageId) return pg;
        return {
          ...pg,
          elements: pg.elements.map((el) =>
            el.id === elementId ? { ...el, ...updates } : el,
          ),
        };
      }),
    }));
  };

  const saveElementName = (pageId: string) => {
    if (editingElementId) {
      updateElement(pageId, editingElementId, { name: editElementName });
      setEditingElementId(null);
    }
  };

  const deleteElement = (pageId: string, elementId: string) => {
    // Immediate deletion without confirmation
    updateProject((p) => ({
      ...p,
      pages: p.pages.map((pg) => {
        if (pg.id !== pageId) return pg;
        return {
          ...pg,
          elements: pg.elements.filter((el) => el.id !== elementId),
        };
      }),
    }));
    if (activeElementId === elementId) setActiveElementId("");
  };


  const startRecording = async () => {
    if (!recordingTargetId) {
      alert('Please select an agent to record on.');
      return;
    }
    if (!recordingUrl.trim() || !activePageId || !currentProjectId) return;
    setIsRecording(true);
    setIsRecordingModalOpen(false);

    try {
      const response = await fetch('/api/recording/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: recordingUrl,
          projectId: currentProjectId,
          pageId: activePageId,
        agentId: recordingTargetId,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || response.statusText);
    }
  } catch (error) {
    console.error('Failed to start recording:', error);
    setIsRecording(false);
  }
};

const stopRecording = async () => {
  try {
    const response = await fetch('/api/recording/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: recordingTargetId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || response.statusText);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    } finally {
      setIsRecording(false);
    }
  };

  // Real-time updates via WebSocket during recording
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.event === 'element-recorded') {
          console.log('New element recorded via WS, invalidating projects...');
          queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        }
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onopen = () => console.log('WS connected for real-time updates');
    ws.onerror = (e) => console.error('WS error:', e);

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="h-full flex bg-gray-50 overflow-hidden relative">
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={
          deleteConfirm?.type === "page" ? "Delete Page" : "Delete Element"
        }
        message={
          deleteConfirm?.type === "page"
            ? "Are you sure you want to delete this page? This action cannot be undone."
            : "Are you sure you want to delete this element? This action cannot be undone."
        }
        onConfirm={() => {
          if (deleteConfirm?.type === "page") {
            deletePage(deleteConfirm.id);
          } else if (deleteConfirm?.type === "element") {
            deleteElement(deleteConfirm.pageId as string, deleteConfirm.id);
          }
          setDeleteConfirm(null);
        }}
        onClose={() => setDeleteConfirm(null)}
      />
      {/* Sidebar Explorer - Light Theme Panel */}
      <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col z-10">
        {/* Project Selector Header */}
        <div className="p-3 border-b border-gray-100 space-y-3 bg-gray-50/50">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div>
            <span className="text-sm font-semibold text-gray-900 truncate">
              {activeProject?.name || "No Project Selected"}
            </span>
          </div>
        </div>
      </div>

          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              size={14}
            />
            <input
              type="text"
              placeholder="Filter pages..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Page Tree */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center">
          Object Repository
          <HelpTooltip content="Manage UI elements organized by pages. These elements can be reused across multiple test cases." />
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setIsRefreshing(true);
              queryClient.invalidateQueries({ queryKey: queryKeys.projects });
              setTimeout(() => setIsRefreshing(false), 500);
            }}
            className="text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <button
            onClick={addPage}
            disabled={!activeProject}
            className="text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors disabled:opacity-50"
            title="Add Page"
          >
            <Plus size={14} />
          </button>
        </div>
          </div>

          {!activeProject && (
            <div className="text-center py-8 px-4 text-gray-400 text-xs italic">
              Select a project in Settings to start.
            </div>
          )}

          <div className="space-y-0.5">
            {filteredPages.map((page) => (
              <div key={page.id} className="select-none">
                {/* Page Header */}
                <div
                  className={`group px-2 py-1.5 rounded-md text-sm font-medium cursor-pointer flex items-center justify-between transition-all duration-200 ${activePageId === page.id && !activeElementId
                      ? "bg-blue-50 text-blue-700 shadow-sm"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  onClick={() => {
                    if (activePageId === page.id && !activeElementId) {
                      setActivePageId("");
                    } else {
                      setActivePageId(page.id);
                      setActiveElementId("");
                    }
                  }}
                >
                  <div className="flex items-center gap-2 overflow-hidden w-full">
                    {activePageId === page.id ? (
                      <ChevronDown
                        size={14}
                        className="shrink-0 text-blue-500"
                      />
                    ) : (
                      <ChevronRight
                        size={14}
                        className="shrink-0 text-gray-400"
                      />
                    )}
                    <Layout
                      size={14}
                      className={`shrink-0 ${activePageId === page.id ? "text-blue-500" : "text-gray-400"}`}
                    />
                    {editingPageId === page.id ? (
                      <input
                        className="w-full px-1 py-0.5 text-xs bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={editPageName}
                        onChange={(e) => setEditPageName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.key === "Enter" && savePageName()}
                        onBlur={savePageName}
                        autoFocus
                      />
                    ) : (
                      <span className="truncate">{page.name}</span>
                    )}
                  </div>

                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingPageId === page.id ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          savePageName();
                        }}
                        className="p-1 text-green-600 hover:bg-green-100 rounded"
                      >
                        <Check size={12} />
                      </button>
                    ) : (
                      <div className="flex gap-0.5 relative z-20">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPageId(page.id);
                            setEditPageName(page.name);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ type: "page", id: page.id });
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                          title="Delete Page"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Element Children */}
                {(activePageId === page.id || searchTerm) && (
                  <div className="ml-3 pl-3 border-l border-gray-100 my-1 space-y-0.5">
                    {page.elements.map((el) => (
                      <div
                        key={el.id}
                        className={`group text-xs py-1.5 px-2 rounded-md cursor-pointer truncate transition-colors flex items-center justify-between ${activeElementId === el.id
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                          }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePageId(page.id);
                          setActiveElementId(el.id);
                        }}
                      >
                        <div className="flex items-center gap-2 overflow-hidden w-full">
                          <Code
                            size={12}
                            className={
                              activeElementId === el.id
                                ? "text-blue-500"
                                : "text-gray-300"
                            }
                          />
                          {editingElementId === el.id ? (
                            <input
                              className="w-full px-1 py-0.5 text-xs bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={editElementName}
                              onChange={(e) =>
                                setEditElementName(e.target.value)
                              }
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) =>
                                e.key === "Enter" && saveElementName(page.id)
                              }
                              onBlur={() => saveElementName(page.id)}
                              autoFocus
                            />
                          ) : (
                            <span className="truncate">{el.name}</span>
                          )}
                        </div>

                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {editingElementId === el.id ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveElementName(page.id);
                              }}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                            >
                              <Check size={12} />
                            </button>
                          ) : (
                            <div className="flex gap-0.5 relative z-20">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingElementId(el.id);
                                  setEditElementName(el.name);
                                }}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm({
                                    type: "element",
                                    id: el.id,
                                    pageId: page.id,
                                  });
                                }}
                                title="Delete Element"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addElement(page.id);
                      }}
                      className="text-[11px] text-gray-400 hover:text-blue-600 px-2 py-1.5 flex items-center gap-1.5 w-full hover:bg-gray-50 rounded transition-colors font-medium group"
                    >
                      <Plus
                        size={10}
                        className="group-hover:scale-110 transition-transform"
                      />{" "}
                      New Element
                    </button>
                  </div>
                )}
              </div>
            ))}

            {activeProject && filteredPages.length === 0 && (
              <div className="text-center py-8 px-4">
                <p className="text-xs text-gray-400">No pages found.</p>
                <button
                  onClick={addPage}
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  Create Page
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area - Form/Detail View */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {activeElement && activePage ? (
          /* Single Element Editor View */
          <div className="flex-1 flex flex-col h-full animate-in fade-in duration-200 overflow-hidden">
            <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5 font-medium">
                  <span
                    className="hover:text-blue-600 cursor-pointer transition-colors"
                    onClick={() => setActiveElementId("")}
                  >
                    {activePage.name}
                  </span>
                  <ChevronRight size={12} className="text-gray-300" />
                  <span>Edit Element</span>
                </div>
                <input
                  className="text-lg font-semibold text-gray-900 border-none p-0 focus:ring-0 bg-transparent placeholder-gray-400 w-full max-w-lg"
                  value={activeElement.name}
                  onChange={(e) => updateElement(activePage.id, activeElement.id, { name: e.target.value })}
                  placeholder="Untitled Element"
                />
              </div>

            </div>

            <div className="flex-1 p-6 bg-gray-50 overflow-hidden flex flex-col">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-8 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Element Name
                  </label>
                  <input
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                    value={activeElement.name}
                    onChange={(e) =>
                      updateElement(activePage.id, activeElement.id, {
                        name: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Description
                  </label>
                  <textarea
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-gray-400 resize-none h-20"
                    value={activeElement.description || ""}
                    onChange={(e) =>
                      updateElement(activePage.id, activeElement.id, {
                        description: e.target.value,
                      })
                    }
                    placeholder="Describe the element's purpose..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Locator Strategy
                    </label>
                    <div className="relative">
                      <select
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none appearance-none"
                        value={activeElement.selectorType}
                        onChange={(e) =>
                          updateElement(activePage.id, activeElement.id, {
                            selectorType: e.target.value as SelectorType,
                          })
                        }
                      >
                        <option value="getByRole">getByRole (Role)</option>
                        <option value="getByTestId">getByTestId (Test ID)</option>
                        <option value="CSS">CSS Selector</option>
                        <option value="getByText">getByText (Text)</option>
                        <option value="getByLabel">getByLabel (Label)</option>
                        <option value="getByPlaceholder">getByPlaceholder (Placeholder)</option>
                        <option value="getByAltText">getByAltText (Alt Text)</option>
                        <option value="getByTitle">getByTitle (Title)</option>
                        <option value="XPath">XPath</option>
                      </select>
                      <ChevronDown
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                        size={14}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex justify-between">
                    <span>Locator Value</span>
                    <span className="text-xs text-gray-500 font-normal">
                      Supports standard Playwright selector syntax
                    </span>
                  </label>
                  <div className="relative">
                    <textarea
                      className="w-full h-32 bg-slate-50 border border-gray-300 rounded-lg px-3 py-3 text-sm font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none leading-relaxed"
                      value={activeElement.value}
                      onChange={(e) =>
                        updateElement(activePage.id, activeElement.id, {
                          value: e.target.value,
                        })
                      }
                    />
                    <div className="absolute top-3 right-3 text-gray-400 bg-white p-1 rounded border border-gray-200">
                      <MousePointer2 size={14} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activePage ? (
          /* Page Bulk Editor View */
          <div className="flex-1 flex flex-col h-full animate-in fade-in duration-200 overflow-hidden">
            <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
              <div className="flex items-center gap-3">
                <Layout className="text-blue-600" size={20} />
                <h2 className="text-lg font-semibold text-gray-900">
                  {activePage.name}
                </h2>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold uppercase tracking-wide">
                  Page Object
                </span>
              </div>
              <div className="flex gap-3 items-center">
                <span className="text-xs text-gray-400 font-medium mr-2">
                  {activePage.elements.length} Elements
                </span>
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md flex items-center gap-2 transition-colors animate-pulse"
                  >
                    <Square size={14} className="fill-current" /> Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={() => setIsRecordingModalOpen(true)}
                    className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-md flex items-center gap-2 transition-colors"
                  >
                    <Video size={14} /> Record Elements
                  </button>
                )}
              </div>
            </div>

            <div className="px-6 pt-4 pb-0 bg-gray-50 shrink-0">
              <input
                className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-gray-400"
                placeholder="Page Description (optional)"
                value={activePage.description || ""}
                onChange={(e) =>
                  updatePage(activePage.id, { description: e.target.value })
                }
              />
            </div>

            <div className="flex-1 p-6 bg-gray-50 overflow-hidden flex flex-col">
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col flex-1">
                <div className="grid grid-cols-12 gap-6 px-6 py-3 bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider shrink-0">
                  <div className="col-span-3">Element Name</div>
                  <div className="col-span-2">Locator Type</div>
                  <div className="col-span-6">Locator Value</div>
                  <div className="col-span-1"></div>
                </div>

                <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
                  {activePage.elements.map((el) => (
                    <div
                      key={el.id}
                      className="grid grid-cols-12 gap-6 items-center px-6 py-3 hover:bg-gray-50/50 transition-colors group"
                    >
                      <div className="col-span-3">
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-md px-2 py-1.5 text-sm text-gray-900 transition-all font-medium placeholder-gray-400"
                          value={el.name}
                          onChange={(e) =>
                            updateElement(activePage.id, el.id, {
                              name: e.target.value,
                            })
                          }
                          placeholder="Element Name"
                        />
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-md px-2 py-1 text-xs text-gray-500 transition-all placeholder-gray-300 mt-1"
                          value={el.description || ""}
                          onChange={(e) =>
                            updateElement(activePage.id, el.id, {
                              description: e.target.value,
                            })
                          }
                          placeholder="Description..."
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          className="w-full bg-transparent text-xs rounded-md border border-transparent hover:border-gray-300 p-1.5 text-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white outline-none transition-colors"
                          value={el.selectorType}
                          onChange={(e) =>
                            updateElement(activePage.id, el.id, {
                              selectorType: e.target.value as SelectorType,
                            })
                          }
                        >
                          <option value="getByRole">getByRole</option>
                          <option value="getByTestId">getByTestId</option>
                          <option value="CSS">CSS Selector</option>
                          <option value="getByText">getByText</option>
                          <option value="getByLabel">getByLabel</option>
                          <option value="getByPlaceholder">getByPlaceholder</option>
                          <option value="getByAltText">getByAltText</option>
                          <option value="getByTitle">getByTitle</option>
                          <option value="XPath">XPath</option>
                        </select>
                      </div>
                      <div className="col-span-6">
                        <div className="relative">
                          <input
                            className="w-full bg-gray-50/50 text-xs font-mono text-gray-600 rounded-md border border-gray-200 px-3 py-1.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none transition-all placeholder-gray-400"
                            value={el.value}
                            onChange={(e) =>
                              updateElement(activePage.id, el.id, {
                                value: e.target.value,
                              })
                            }
                            placeholder="Selector value"
                          />
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            setDeleteConfirm({
                              type: "element",
                              id: el.id,
                              pageId: activePage.id,
                            })
                          }
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {activePage.elements.length === 0 && (
                  <div className="text-center py-16 bg-gray-50/50">
                    <Database
                      className="mx-auto text-gray-300 mb-3"
                      size={32}
                    />
                    <p className="text-gray-500 text-sm font-medium">
                      No elements defined for this page yet.
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      Use the sidebar (+) to add new elements.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-4">
              <Layout size={32} className="text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">
              Select a page or element from the explorer
            </p>
            <button
              disabled={!activeProject}
              onClick={addPage}
              className="mt-4 px-4 py-2 bg-white border border-gray-200 shadow-sm rounded-md text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-all font-medium disabled:opacity-50"
            >
              Create a new page
            </button>
          </div>
        )}
      </div>


      {isRecordingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-0 rounded-xl w-[500px] shadow-2xl border border-gray-200 animate-in fade-in zoom-in duration-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900">
                <Video className="text-green-600" size={20} />
                Record Elements
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Enter the URL you want to record. A new browser window will open. Click on elements to automatically extract and save them.
              </p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Target URL
              </label>
              <input
                type="url"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all placeholder-gray-400"
                placeholder="https://example.com"
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
                autoFocus
              />

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Recording Target
                </label>
                <ExecutionTargetSelector
                  selectedAgentId={recordingTargetId}
                  onSelect={setRecordingTargetId}
                  mode="recording"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setIsRecordingModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={startRecording}
                  disabled={!recordingUrl.trim()}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 font-medium shadow-sm transition-all hover:shadow-green-500/20"
                >
                  Start Recording
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
