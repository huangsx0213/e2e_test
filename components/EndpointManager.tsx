import React, { useState } from 'react';
import { Plus, Trash2, Save, Search, Globe, Check, X } from 'lucide-react';
import { ApiEndpoint } from '../types';

interface EndpointManagerProps {
  endpoints: ApiEndpoint[];
  endpointsApi: any;
  environments: string[];
}

export function EndpointManager({ endpoints, endpointsApi, environments }: EndpointManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editUrls, setEditUrls] = useState<Record<string, string>>({});

  const selectedEndpoint = endpoints.find(e => e.id === selectedId);

  const handleSelect = (endpoint: ApiEndpoint) => {
    setSelectedId(endpoint.id);
    setEditName(endpoint.name);
    setEditDesc(endpoint.description || '');
    setEditUrls({ ...endpoint.baseUrls });
  };

  const handleCreate = async () => {
    const initialUrls: Record<string, string> = {};
    environments.forEach(env => initialUrls[env] = '');
    
    const newEndpoint: ApiEndpoint = {
      id: `e_${Date.now()}`,
      name: 'New Service Endpoint',
      description: '',
      baseUrls: initialUrls
    };
    await endpointsApi.create(newEndpoint);
    handleSelect(newEndpoint);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    await endpointsApi.update(selectedId, { name: editName, description: editDesc, baseUrls: editUrls });
  };

  const handleDelete = async (id: string) => {
    await endpointsApi.remove(id);
    if (selectedId === id) setSelectedId(null);
  };

  const filteredEndpoints = endpoints.filter(e => 
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar List */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-4 border-b border-gray-200 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Globe size={18} className="text-indigo-600" />
              Endpoints
            </h2>
            <button 
              onClick={handleCreate}
              className="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
              title="Create New Endpoint"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text"
              placeholder="Search endpoints..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredEndpoints.map(endpoint => (
            <div 
              key={endpoint.id}
              onClick={() => handleSelect(endpoint)}
              className={`p-3 rounded-lg cursor-pointer border transition-all group ${
                selectedId === endpoint.id 
                  ? 'bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-500/20' 
                  : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`font-medium text-sm ${selectedId === endpoint.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                  {endpoint.name}
                </span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(endpoint.id); }}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="text-xs text-gray-500 truncate">{endpoint.description || 'No description'}</p>
            </div>
          ))}
          {filteredEndpoints.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-xs">
              No endpoints found.
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {selectedEndpoint ? (
          <>
            {/* Header */}
            <div className="h-16 border-b border-gray-200 flex items-center justify-between px-8 bg-white shrink-0">
              <div>
                <h1 className="text-lg font-bold text-gray-900">{editName || 'Untitled Endpoint'}</h1>
                <p className="text-xs text-gray-500 font-mono">ID: {selectedEndpoint.id}</p>
              </div>
              <button 
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Save size={16} />
                Save Changes
              </button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-3xl space-y-8">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-2">
                    General Information
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g. User Service"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <input 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Describe this service..."
                      />
                    </div>
                  </div>
                </div>

                {/* Environment URLs */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-2 flex items-center gap-2">
                    Environment URLs
                  </h3>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-4">
                    {environments.map(env => (
                      <div key={env} className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${
                            env === 'PROD' ? 'bg-red-50 text-red-700 border-red-200' :
                            env === 'UAT' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            env === 'SIT' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-green-50 text-green-700 border-green-200'
                          }`}>
                            {env}
                          </span>
                        </div>
                        <div className="col-span-10">
                          <input 
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm font-mono text-gray-600 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none placeholder-gray-300"
                            value={editUrls[env] || ''}
                            onChange={(e) => setEditUrls({ ...editUrls, [env]: e.target.value })}
                            placeholder={`https://${env.toLowerCase()}-api.example.com`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Define the base URL for each environment. These will be used when executing tests against a specific environment.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/30">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Globe size={32} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium">Select an endpoint to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}
