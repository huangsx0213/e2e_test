import React, { useState } from 'react';
import { Plus, Trash2, Save, Settings as SettingsIcon, Globe, FolderGit2 } from 'lucide-react';
import { Project } from '../types';

interface SettingsProps {
  environments: string[];
  setEnvironments: React.Dispatch<React.SetStateAction<string[]>>;
  currentEnvironment: string;
  setCurrentEnvironment: React.Dispatch<React.SetStateAction<string>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  currentProjectId: string;
  setCurrentProjectId: React.Dispatch<React.SetStateAction<string>>;
}

export const Settings: React.FC<SettingsProps> = ({ 
  environments, 
  setEnvironments, 
  currentEnvironment, 
  setCurrentEnvironment,
  projects,
  setProjects,
  currentProjectId,
  setCurrentProjectId
}) => {
  const [newEnvName, setNewEnvName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [activeTab, setActiveTab] = useState<'PROJECTS' | 'ENVIRONMENTS' | 'SYSTEM'>('PROJECTS');

  const handleAddEnvironment = () => {
    if (newEnvName && !environments.includes(newEnvName.toUpperCase())) {
      setEnvironments([...environments, newEnvName.toUpperCase()]);
      setNewEnvName('');
    }
  };

  const handleRemoveEnvironment = (env: string) => {
    if (environments.length > 1) {
      const newEnvs = environments.filter(e => e !== env);
      setEnvironments(newEnvs);
      if (currentEnvironment === env) {
        setCurrentEnvironment(newEnvs[0]);
      }
    }
  };

  const handleAddProject = () => {
    if (newProjectName) {
        const newProject: Project = {
            id: `proj-${Date.now()}`,
            name: newProjectName,
            description: '',
            pages: [],
            modules: []
        };
        setProjects([...projects, newProject]);
        setNewProjectName('');
        if (!currentProjectId) {
            setCurrentProjectId(newProject.id);
        }
    }
  };

  const handleRemoveProject = (projectId: string) => {
      const newProjects = projects.filter(p => p.id !== projectId);
      setProjects(newProjects);
      if (currentProjectId === projectId) {
          setCurrentProjectId(newProjects[0]?.id || '');
      }
  };

  return (
    <div className="h-full overflow-y-auto">
        <div className="p-8 max-w-4xl mx-auto space-y-6">
        
        {/* Settings Header & Tabs */}
        <div className="flex flex-col gap-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h2>
                <p className="text-gray-500 text-sm mt-1">Manage your workspace, environments, and system configuration.</p>
            </div>

            <div className="flex items-center gap-1 border-b border-gray-200">
                <button 
                    onClick={() => setActiveTab('PROJECTS')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'PROJECTS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    Projects
                </button>
                <button 
                    onClick={() => setActiveTab('ENVIRONMENTS')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ENVIRONMENTS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    Environments
                </button>
                <button 
                    onClick={() => setActiveTab('SYSTEM')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'SYSTEM' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    System
                </button>
            </div>
        </div>

        {/* Project Management Section */}
        {activeTab === 'PROJECTS' && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center gap-2">
                    <FolderGit2 size={16} className="text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Project Management</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Current Project</label>
                        <select 
                            className="w-full max-w-xs bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            value={currentProjectId}
                            onChange={(e) => setCurrentProjectId(e.target.value)}
                        >
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                            {projects.length === 0 && <option value="">No Projects Available</option>}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">All modules will automatically load data from this project.</p>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-4">Available Projects</label>
                        <div className="space-y-3 mb-4">
                            {projects.map(p => (
                                <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200 group">
                                    <span className="font-medium text-sm text-gray-700">{p.name}</span>
                                    <div className="flex items-center gap-2">
                                        {p.id === currentProjectId && (
                                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium border border-green-200">Active</span>
                                        )}
                                        <button 
                                            onClick={() => handleRemoveProject(p.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Remove Project"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {projects.length === 0 && <p className="text-sm text-gray-400 italic">No projects created yet.</p>}
                        </div>

                        <div className="flex gap-2">
                            <input 
                                className="flex-1 bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none placeholder-gray-400"
                                placeholder="New Project Name"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
                            />
                            <button 
                                onClick={handleAddProject}
                                disabled={!newProjectName}
                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            >
                                <Plus size={16} /> Add
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Environment Management Section */}
        {activeTab === 'ENVIRONMENTS' && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center gap-2">
                    <Globe size={16} className="text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Environment Management</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Current Environment</label>
                        <select 
                            className="w-full max-w-xs bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            value={currentEnvironment}
                            onChange={(e) => setCurrentEnvironment(e.target.value)}
                        >
                            {environments.map(env => (
                                <option key={env} value={env}>{env}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">This environment will be selected by default when running tests.</p>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-4">Defined Environments</label>
                        <div className="space-y-3 mb-4">
                            {environments.map(env => (
                                <div key={env} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200 group">
                                    <span className="font-mono text-sm font-medium text-gray-700">{env}</span>
                                    <div className="flex items-center gap-2">
                                        {env === currentEnvironment && (
                                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium border border-green-200">Active</span>
                                        )}
                                        <button 
                                            onClick={() => handleRemoveEnvironment(env)}
                                            disabled={environments.length <= 1}
                                            className={`p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors ${environments.length <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            title="Remove Environment"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <input 
                                className="flex-1 bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none uppercase placeholder-gray-400"
                                placeholder="NEW_ENV_NAME"
                                value={newEnvName}
                                onChange={(e) => setNewEnvName(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddEnvironment()}
                            />
                            <button 
                                onClick={handleAddEnvironment}
                                disabled={!newEnvName || environments.includes(newEnvName)}
                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            >
                                <Plus size={16} /> Add
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* System Configuration Section */}
        {activeTab === 'SYSTEM' && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center gap-2">
                    <SettingsIcon size={16} className="text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">System Configuration</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Google Gemini API Key</label>
                        <div className="flex gap-2">
                            <input 
                                type="password" 
                                value="**************************" 
                                disabled 
                                className="flex-1 bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-gray-500 sm:text-sm cursor-not-allowed"
                            />
                            <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm">Update</button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">The API Key is securely injected via environment variables (process.env.API_KEY).</p>
                    </div>
                </div>
            </div>
        )}
        </div>
    </div>
  );
};

