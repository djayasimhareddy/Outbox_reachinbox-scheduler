import React, { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Send, ChevronDown, PenSquare, Hash } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

const LOGO = () => (
  <div className="flex items-center gap-0.5 mb-6">
    {['O', 'N', 'B'].map((l) => (
      <div key={l} className="w-8 h-8 border-2 border-gray-900 flex items-center justify-center rounded-sm">
        <span className="font-bold text-sm">{l}</span>
      </div>
    ))}
  </div>
);

const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [slackToast, setSlackToast] = useState('');
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle Slack OAuth return
  useEffect(() => {
    const slack = searchParams.get('slack');
    if (slack === 'connected') setSlackToast('✅ Slack connected successfully!');
    else if (slack === 'denied') setSlackToast('Slack connection cancelled.');
    else if (slack === 'failed') setSlackToast('⚠️ Slack connection failed.');
    if (slack) {
      const t = setTimeout(() => setSlackToast(''), 4000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // Fetch counts
  useEffect(() => {
    api.get('/api/emails?status=scheduled&limit=1').then(r => setScheduledCount(r.data.total)).catch(() => {});
    api.get('/api/emails?status=sent&limit=1').then(r => setSentCount(r.data.total)).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSlackConnect = () => {
    window.location.href = 'http://localhost:4000/slack/connect';
  };

  const handleSlackDisconnect = async () => {
    await api.post('/slack/disconnect');
    setSlackToast('Slack disconnected.');
    setTimeout(() => setSlackToast(''), 3000);
    setDropdownOpen(false);
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-gray-100 p-4 flex flex-col h-screen flex-shrink-0">
        <LOGO />

        {/* User Card */}
        <div className="relative mb-4" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between gap-2 bg-[#F5F7F5] rounded-xl p-2.5 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              {user?.avatar ? (
                <img src={user.avatar} alt="avatar" className="w-8 h-8 rounded-full flex-shrink-0 object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-700 font-semibold text-sm">{user?.name?.[0] ?? 'U'}</span>
                </div>
              )}
              <div className="min-w-0 text-left">
                <p className="text-xs font-semibold text-gray-900 truncate">{user?.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-20 overflow-hidden py-1">
              <div className="px-3 py-2 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-800">{user?.name}</p>
                <p className="text-[10px] text-gray-400">{user?.email}</p>
              </div>
              {user?.slackConnected ? (
                <button
                  onClick={handleSlackDisconnect}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Hash className="w-3.5 h-3.5 text-purple-500" />
                  Disconnect Slack
                </button>
              ) : (
                <button
                  onClick={handleSlackConnect}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Hash className="w-3.5 h-3.5 text-purple-500" />
                  Connect Slack
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Compose */}
        <button
          onClick={() => navigate('/compose')}
          className="w-full flex items-center justify-center gap-2 border border-[#3FA253] text-[#3FA253] py-2 rounded-xl text-sm font-medium hover:bg-green-50 transition-colors mb-6"
        >
          <PenSquare className="w-3.5 h-3.5" />
          Compose
        </button>

        {/* Nav */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold px-3 mb-2">Core</p>
          <NavLink
            to="/scheduled"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4" />
              <span>Scheduled</span>
            </div>
            {scheduledCount !== null && (
              <span className="text-[10px] text-gray-400">{scheduledCount}</span>
            )}
          </NavLink>

          <NavLink
            to="/sent"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <div className="flex items-center gap-2.5">
              <Send className="w-4 h-4" />
              <span>Sent</span>
            </div>
            {sentCount !== null && (
              <span className="text-[10px] text-gray-400">{sentCount}</span>
            )}
          </NavLink>
        </div>

        {/* Bull Board link */}
        <div className="mt-auto pt-4 border-t border-gray-100">
          <a
            href="http://localhost:4000/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Bull Board
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Outlet />
      </main>

      {/* Slack Toast */}
      {slackToast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-2xl z-50 transition-all">
          {slackToast}
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
