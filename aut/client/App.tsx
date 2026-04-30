import React from 'react';
import { Routes, Route, Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { Home as HomeIcon, Users, LogOut, Shield, BarChart } from 'lucide-react';
import { Home } from './Home';
import { UserManagement } from './UserManagement';
import { Reports } from './Reports';
import { LoginPage } from './LoginPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('aut_token');
  if (!token) return <Navigate to="/aut/login" replace />;
  return <>{children}</>;
}

function Layout() {
  const location = useLocation();
  const navItems = [
    { path: '/aut', label: 'Home', icon: <HomeIcon size={20} /> },
    { path: '/aut/users', label: 'User Management', icon: <Users size={20} /> },
    { path: '/aut/reports', label: 'Reports', icon: <BarChart size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 transition-all duration-300">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm">
              <Shield size={18} className="text-white" />
            </span>
            Target AUT
          </h1>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/aut' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <Link to="/aut/login" onClick={() => localStorage.removeItem('aut_token')} className="flex items-center gap-3 px-3 py-2 text-slate-300 hover:text-white transition-colors">
            <LogOut size={20} />
            <span className="text-sm">Sign Out</span>
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {navItems.find(i => location.pathname === i.path || (i.path !== '/aut' && location.pathname.startsWith(i.path)))?.label || 'AUT App'}
          </h2>
        </header>
        <div className="p-8 flex-1 overflow-auto bg-gray-50/50">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/aut/login" element={<LoginPage />} />
      <Route path="/aut" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Home />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}
