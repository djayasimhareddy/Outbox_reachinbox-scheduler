import React, { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Paperclip, Clock, ChevronDown, X, Upload,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, Undo, Redo, Send, Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import type { ScheduleResponse } from '../types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEmails(text: string): string[] {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  return [...new Set((text.match(re) ?? []).map(e => e.toLowerCase()))];
}

function formatLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Quick presets for "Send Later"
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const QUICK_TIMES: { label: string; value: Date }[] = [
  { label: 'Tomorrow, 9:00 AM',  value: new Date(new Date(tomorrow).setHours(9, 0, 0, 0)) },
  { label: 'Tomorrow, 10:00 AM', value: new Date(new Date(tomorrow).setHours(10, 0, 0, 0)) },
  { label: 'Tomorrow, 11:00 AM', value: new Date(new Date(tomorrow).setHours(11, 0, 0, 0)) },
  { label: 'Tomorrow, 3:00 PM',  value: new Date(new Date(tomorrow).setHours(15, 0, 0, 0)) },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface EmailTagProps { email: string; onRemove: () => void }
const EmailTag: React.FC<EmailTagProps> = ({ email, onRemove }) => (
  <span className="tag-chip">
    {email}
    <button
      type="button"
      onClick={onRemove}
      className="ml-0.5 text-green-600 hover:text-red-500 transition-colors"
    >
      <X className="w-3 h-3" />
    </button>
  </span>
);

interface ToastProps { message: string; type: 'success' | 'error' }
const Toast: React.FC<ToastProps> = ({ message, type }) => (
  <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl transition-all
    ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}>
    {message}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const ComposeEmail: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Form state
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [subject, setSubject] = useState('');
  const body = '';
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(50);
  const [startTime, setStartTime] = useState(formatLocalDatetime(new Date(Date.now() + 60_000)));

  // UI state
  const [showSendLater, setShowSendLater] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [csvCount, setCsvCount] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sendLaterRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Recipient tag input ──
  const addRecipient = useCallback((raw: string) => {
    const emails = parseEmails(raw);
    if (emails.length === 0) return;
    setRecipients(prev => [...new Set([...prev, ...emails])]);
    setRecipientInput('');
  }, []);

  const handleRecipientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addRecipient(recipientInput);
    }
    if (e.key === 'Backspace' && recipientInput === '' && recipients.length > 0) {
      setRecipients(prev => prev.slice(0, -1));
    }
  };

  const removeRecipient = (i: number) =>
    setRecipients(prev => prev.filter((_, idx) => idx !== i));

  // ── CSV / TXT upload ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const found = parseEmails(text);
      setRecipients(prev => [...new Set([...prev, ...found])]);
      setCsvCount(found.length);
      setUploading(false);
      showToast(`Imported ${found.length} email${found.length !== 1 ? 's' : ''} from file.`, 'success');
    };
    reader.readAsText(file);
    // reset so same file can be re-uploaded
    e.target.value = '';
  };

  // ── Rich text toolbar commands ──
  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    bodyRef.current?.focus();
  };

  // ── Submit ──
  const handleSend = async () => {
    if (recipients.length === 0) { showToast('Add at least one recipient.', 'error'); return; }
    if (!subject.trim()) { showToast('Subject is required.', 'error'); return; }
    const bodyText = bodyRef.current?.innerText?.trim() ?? body.trim();
    if (!bodyText) { showToast('Email body cannot be empty.', 'error'); return; }

    setSubmitting(true);
    try {
      const payload = {
        subject,
        body: bodyRef.current?.innerHTML ?? body,
        emails: recipients,
        startTime: new Date(startTime).toISOString(),
        delaySeconds,
        hourlyLimit,
      };
      const { data } = await api.post<ScheduleResponse>('/api/emails/schedule', payload);
      showToast(`✅ Scheduled ${data.scheduled} email${data.scheduled !== 1 ? 's' : ''} successfully!`, 'success');
      setTimeout(() => navigate('/scheduled'), 2000);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.formErrors?.[0]
        ?? err?.response?.data?.error
        ?? 'Failed to schedule. Please try again.';
      showToast(typeof msg === 'string' ? msg : JSON.stringify(msg), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Compose New Email</h1>
        </div>

        <div className="flex items-center gap-3 relative">
          {/* Attach */}
          <button
            onClick={() => fileRef.current?.click()}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            title="Upload CSV / TXT"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileUpload} />

          {/* Send Later */}
          <button
            onClick={() => setShowSendLater(v => !v)}
            className={`p-2 transition-colors rounded-lg hover:bg-gray-100 ${showSendLater ? 'text-green-500 bg-green-50' : 'text-gray-400 hover:text-gray-600'}`}
            title="Schedule: Send Later"
          >
            <Clock className="w-4 h-4" />
          </button>

          {/* Send Later Popover */}
          {showSendLater && (
            <div
              ref={sendLaterRef}
              className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-100 rounded-2xl shadow-2xl z-30 p-5"
            >
              <h3 className="font-semibold text-gray-900 mb-4">Send Later</h3>

              {/* Custom datetime */}
              <label className="text-xs text-gray-400 mb-1 block">Pick date & time</label>
              <div className="relative mb-4">
                <input
                  type="datetime-local"
                  value={startTime}
                  min={formatLocalDatetime(new Date())}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 transition-colors"
                />
              </div>

              <p className="text-xs text-gray-400 mb-2">Quick presets</p>
              <div className="space-y-1 mb-5">
                {QUICK_TIMES.map(qt => (
                  <button
                    key={qt.label}
                    onClick={() => setStartTime(formatLocalDatetime(qt.value))}
                    className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                      startTime === formatLocalDatetime(qt.value)
                        ? 'bg-green-50 text-green-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {qt.label}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  onClick={() => setShowSendLater(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowSendLater(false)}
                  className="text-sm font-medium text-green-600 border border-green-500 px-4 py-1.5 rounded-full hover:bg-green-50 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={submitting}
            className="flex items-center gap-2 border border-[#3FA253] text-[#3FA253] px-5 py-2 rounded-full text-sm font-medium hover:bg-green-50 transition-colors disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Scheduling...' : 'Send Later'}
          </button>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-0">

          {/* From */}
          <div className="flex items-center gap-4 py-3 border-b border-gray-100">
            <label className="text-sm font-medium text-gray-400 w-16 flex-shrink-0">From</label>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-800 border border-gray-100 cursor-default">
              {user?.email ?? 'your@email.com'}
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>

          {/* To — tag input */}
          <div className="flex items-start gap-4 py-3 border-b border-gray-100">
            <label className="text-sm font-medium text-gray-400 w-16 flex-shrink-0 pt-1.5">To</label>
            <div className="flex flex-wrap gap-1.5 flex-1 items-center min-h-[36px]">
              {recipients.map((r, i) => (
                <EmailTag key={r} email={r} onRemove={() => removeRecipient(i)} />
              ))}
              <input
                type="text"
                value={recipientInput}
                onChange={e => setRecipientInput(e.target.value)}
                onKeyDown={handleRecipientKeyDown}
                onBlur={() => { if (recipientInput) addRecipient(recipientInput); }}
                placeholder={recipients.length === 0 ? 'recipient@example.com' : ''}
                className="flex-1 min-w-[180px] border-none focus:outline-none text-sm text-gray-900 placeholder-gray-300"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 ml-auto flex-shrink-0 border border-green-200 px-3 py-1 rounded-full bg-green-50 hover:bg-green-100 transition-colors"
              >
                <Upload className="w-3 h-3" />
                Upload List
                {csvCount !== null && <span className="text-green-500">({csvCount})</span>}
              </button>
            </div>
          </div>

          {/* Subject */}
          <div className="flex items-center gap-4 py-3 border-b border-gray-100">
            <label className="text-sm font-medium text-gray-400 w-16 flex-shrink-0">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 border-none focus:outline-none text-sm text-gray-900 placeholder-gray-300 font-medium"
            />
          </div>

          {/* Delay + Hourly Limit */}
          <div className="flex items-center gap-8 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Delay between 2 emails</label>
              <input
                type="number"
                min={0}
                value={delaySeconds}
                onChange={e => setDelaySeconds(Number(e.target.value))}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-green-400 text-center"
              />
              <span className="text-xs text-gray-400">sec</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Hourly Limit</label>
              <input
                type="number"
                min={1}
                max={500}
                value={hourlyLimit}
                onChange={e => setHourlyLimit(Number(e.target.value))}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-green-400 text-center"
              />
            </div>
          </div>

          {/* Rich text editor */}
          <div className="pt-4">
            <p
              ref={bodyRef as any}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {}} // no-op, we read innerHTML on submit
              className="min-h-[260px] text-sm text-gray-800 focus:outline-none placeholder:text-gray-300 leading-relaxed"
              data-placeholder="Type Your Reply..."
              style={{ whiteSpace: 'pre-wrap' }}
            />

            {/* Toolbar */}
            <div className="flex items-center gap-1 flex-wrap mt-3 pt-3 border-t border-gray-100 text-gray-400">
              <ToolBtn onClick={() => execCmd('undo')} title="Undo"><Undo className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => execCmd('redo')} title="Redo"><Redo className="w-4 h-4" /></ToolBtn>
              <Divider />
              <ToolBtn onClick={() => execCmd('bold')} title="Bold"><Bold className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => execCmd('italic')} title="Italic"><Italic className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => execCmd('underline')} title="Underline"><Underline className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => execCmd('strikeThrough')} title="Strikethrough"><Strikethrough className="w-4 h-4" /></ToolBtn>
              <Divider />
              <ToolBtn onClick={() => execCmd('justifyLeft')} title="Align Left"><AlignLeft className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => execCmd('justifyCenter')} title="Align Center"><AlignCenter className="w-4 h-4" /></ToolBtn>
              <Divider />
              <ToolBtn onClick={() => execCmd('insertOrderedList')} title="Ordered List"><ListOrdered className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => execCmd('insertUnorderedList')} title="Bullet List"><List className="w-4 h-4" /></ToolBtn>
              <Divider />
              <ToolBtn
                onClick={() => {
                  const url = prompt('Enter URL:');
                  if (url) execCmd('createLink', url);
                }}
                title="Insert Link"
              >
                <span className="text-xs font-semibold">URL</span>
              </ToolBtn>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

// Toolbar helpers
const ToolBtn: React.FC<{ onClick: () => void; title?: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="p-1.5 rounded hover:bg-gray-100 hover:text-gray-700 transition-colors"
  >
    {children}
  </button>
);
const Divider = () => <div className="w-px h-4 bg-gray-100 mx-1" />;

export default ComposeEmail;
