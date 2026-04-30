import React, { useState, useEffect } from 'react';
import { Home as HomeIcon, Users, Settings, Bell, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Home() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/aut-api/dashboard/stats')
      .then(r => r.json())
      .then(d => {
        if (d.success) setStats(d.data);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-10">
          <HomeIcon size={120} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2 relative z-10" id="home-welcome">Welcome back, Admin!</h1>
        <p className="text-gray-600 max-w-xl relative z-10">
          This is the central hub for the Target App Demo. From here you can check system status, 
          manage your users, and configure application settings.
        </p>
        <div className="mt-6 flex items-center gap-4 relative z-10">
          <Link to="/aut/users" className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            Manage Users <ArrowRight size={18} />
          </Link>
          <Link to="/aut/reports" className="bg-white text-gray-700 border border-gray-300 px-5 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors inline-block text-center flex items-center justify-center">
            View Reports
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4">
            <Users size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Total Users</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalUsers || '-'}</p>
          <p className="text-sm text-gray-500 mt-1">Across all roles</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-4">
            <Bell size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Active Sessions</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.activeUsers || '-'}</p>
          <p className="text-sm text-gray-500 mt-1">Currently online</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mb-4">
            <Settings size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">System Status</h3>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
            <p className="text-lg font-semibold text-emerald-600">All systems operational</p>
          </div>
          <p className="text-sm text-gray-500 mt-1">Last checked just now</p>
        </div>
      </div>
    </div>
  );
}
