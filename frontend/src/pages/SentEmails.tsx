import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Filter, RefreshCw, Star, Send, CheckCircle, XCircle } from 'lucide-react';
import api from '../lib/api';
import type { Email, EmailListResponse } from '../types/api';

const PAGE_SIZE = 20;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
    hour12: true, month: 'short', day: 'numeric',
  });
}

const StatusBadge: React.FC<{ status: Email['status'] }> = ({ status }) => {
  if (status === 'SENT') return <span className="badge-sent">Sent</span>;
  if (status === 'FAILED') return <span className="badge-failed">Failed</span>;
  return <span className="badge-sent">{status}</span>;
};

const SentEmails: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchEmails = useCallback(async (pg: number, q: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      let data: EmailListResponse;
      if (q.trim()) {
        const r = await api.get<EmailListResponse>('/api/emails/search', {
          params: { q, status: 'sent', page: pg, limit: PAGE_SIZE },
        });
        data = r.data;
      } else {
        const r = await api.get<EmailListResponse>('/api/emails', {
          params: { status: 'sent', page: pg, limit: PAGE_SIZE },
        });
        data = r.data;
      }
      setEmails(data.data);
      setTotal(data.total);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails(page, debouncedSearch);
  }, [page, debouncedSearch, fetchEmails]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(val);
    }, 400);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-screen">
      {/* Topbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={handleSearchChange}
            type="text"
            placeholder="Search"
            className="w-full bg-[#F5F7F5] rounded-full pl-9 pr-4 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200"
          />
        </div>
        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50">
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={() => fetchEmails(page, debouncedSearch, true)}
          className={`p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50 ${refreshing ? 'animate-spin text-green-500' : ''}`}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-7 h-7 border-2 border-[#3FA253] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Loading sent emails...</p>
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center">
              <Send className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">No sent emails yet</p>
            <p className="text-xs text-gray-400">Emails you've sent will appear here.</p>
          </div>
        ) : (
          <>
            {emails.map((email) => (
              <div key={email.id} className="email-row group">
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  {/* Recipient */}
                  <span className="text-sm font-semibold text-gray-800 w-44 truncate flex-shrink-0">
                    To: {email.toEmail}
                  </span>

                  {/* Status */}
                  <StatusBadge status={email.status} />

                  {/* Subject */}
                  <span className="text-sm text-gray-700 truncate flex-1">
                    <span className="font-medium">{email.subject}</span>
                    {email.error && (
                      <span className="text-red-400 text-xs ml-2">({email.error})</span>
                    )}
                  </span>

                  {/* Sent time */}
                  {email.sentAt && (
                    <span className="text-xs text-gray-400 flex-shrink-0 hidden lg:block">
                      {formatDate(email.sentAt)}
                    </span>
                  )}
                </div>

                <button className="flex-shrink-0 ml-4 text-gray-200 group-hover:text-gray-400 hover:text-yellow-400 transition-colors">
                  <Star className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-4 border-t border-gray-50">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  Prev
                </button>
                <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SentEmails;
