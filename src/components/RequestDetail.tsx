import React from 'react';
import { X, Clock, Database, Globe, Shield, CreditCard, Code, List } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HAREntry } from '../types';
import { cn } from '../lib/utils';

interface RequestDetailProps {
  entry: HAREntry | null;
  onClose: () => void;
}

export default function RequestDetail({ entry, onClose }: RequestDetailProps) {
  if (!entry) return null;

  const tabs = [
    { id: 'headers', label: 'Headers', icon: <Globe className="w-4 h-4" /> },
    { id: 'payload', label: 'Payload', icon: <Database className="w-4 h-4" />, hidden: !entry.request.postData && entry.request.queryString.length === 0 },
    { id: 'response', label: 'Response', icon: <Code className="w-4 h-4" /> },
    { id: 'cookies', label: 'Cookies', icon: <Shield className="w-4 h-4" />, hidden: entry.request.cookies.length === 0 && entry.response.cookies.length === 0 },
    { id: 'timing', label: 'Timing', icon: <Clock className="w-4 h-4" /> },
  ];

  const [activeTab, setActiveTab] = React.useState('headers');

  const formatJSON = (text: string | undefined) => {
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return text;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-end pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
        />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col pointer-events-auto"
        >
          {/* Header */}
          <div className="p-6 border-b border-black/5 flex items-center justify-between bg-black text-white">
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate pr-4" title={entry.request.url}>
                {entry.request.url}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                  entry.response.status >= 400 ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
                )}>
                  {entry.response.status} {entry.response.statusText}
                </span>
                <span className="text-[10px] font-mono text-white/60 uppercase">
                  {entry.request.method} • {entry.request.httpVersion}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-black/5 bg-black/[0.02] overflow-x-auto scrollbar-hide">
            {tabs.filter(t => !t.hidden).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-6 py-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors shrink-0",
                  activeTab === tab.id
                    ? "border-black text-black bg-white"
                    : "border-transparent text-black/40 hover:text-black/60"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {activeTab === 'headers' && (
              <div className="space-y-6">
                <DetailSection title="General" data={[
                  { label: 'Request URL', value: entry.request.url },
                  { label: 'Request Method', value: entry.request.method },
                  { label: 'Status Code', value: `${entry.response.status} ${entry.response.statusText}` },
                  { label: 'Remote Address', value: entry.serverIPAddress || 'N/A' },
                  { label: 'Referrer Policy', value: entry.request.headers.find(h => h.name.toLowerCase() === 'referrer-policy')?.value || 'N/A' },
                ]} />
                <DetailSection title="Response Headers" data={entry.response.headers} isList />
                <DetailSection title="Request Headers" data={entry.request.headers} isList />
              </div>
            )}

            {activeTab === 'payload' && (
              <div className="space-y-6">
                {entry.request.queryString.length > 0 && (
                  <DetailSection title="Query String Parameters" data={entry.request.queryString} isList />
                )}
                {entry.request.postData && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Request Payload</h3>
                    <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5">
                      <p className="text-xs text-black/40 mb-2">MIME Type: {entry.request.postData.mimeType}</p>
                      {entry.request.postData.text ? (
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white p-4 rounded-xl border border-black/5 max-h-[400px] overflow-y-auto">
                          {formatJSON(entry.request.postData.text)}
                        </pre>
                      ) : entry.request.postData.params ? (
                        <div className="space-y-2">
                          {entry.request.postData.params.map((p, i) => (
                            <div key={i} className="grid grid-cols-[120px_1fr] gap-4 py-1 border-b border-black/[0.03] last:border-0">
                              <span className="text-xs font-bold text-black/60 truncate">{p.name}</span>
                              <span className="text-xs font-mono text-black/80 break-all">{p.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-black/40 italic">No text or parameters found in postData</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'response' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Response Body</h3>
                  <span className="text-[10px] text-black/30 font-mono">{entry.response.content.mimeType}</span>
                </div>
                <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5">
                  {entry.response.content.text ? (
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white p-4 rounded-xl border border-black/5 max-h-[500px] overflow-y-auto">
                      {formatJSON(entry.response.content.text)}
                    </pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-black/30">
                      <Database className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-xs italic">Response content not available in HAR file</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'cookies' && (
              <div className="space-y-6">
                {entry.response.cookies.length > 0 && (
                  <DetailSection title="Response Cookies" data={entry.response.cookies.map(c => ({ name: c.name, value: c.value }))} isList />
                )}
                {entry.request.cookies.length > 0 && (
                  <DetailSection title="Request Cookies" data={entry.request.cookies.map(c => ({ name: c.name, value: c.value }))} isList />
                )}
              </div>
            )}

            {activeTab === 'timing' && (
              <div className="space-y-6">
                <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Timing Breakdown</h3>
                <div className="space-y-4">
                  {Object.entries(entry.timings).map(([key, value]) => {
                    if (value === -1 || typeof value !== 'number') return null;
                    const max = Math.max(...Object.values(entry.timings).filter(v => typeof v === 'number' && v > 0) as number[]);
                    const width = (value / max) * 100;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="capitalize text-black/60">{key}</span>
                          <span className="font-mono font-bold">{Math.round(value)}ms</span>
                        </div>
                        <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${width}%` }}
                            className="h-full bg-black/20 rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-4 border-t border-black/5 mt-4">
                    <div className="flex justify-between text-sm font-bold">
                      <span>Total Time</span>
                      <span className="font-mono">{Math.round(entry.time)}ms</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function DetailSection({ title, data, isList }: { title: string, data: any[], isList?: boolean }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">{title}</h3>
      <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5 space-y-2">
        {data.map((item, i) => (
          <div key={i} className="grid grid-cols-[140px_1fr] gap-4 py-1.5 border-b border-black/[0.03] last:border-0 items-start">
            <span className="text-xs font-bold text-black/60 break-all select-all">{isList ? item.name : item.label}</span>
            <span className="text-xs font-mono text-black/80 break-all select-all">{isList ? item.value : item.value}</span>
          </div>
        ))}
        {data.length === 0 && <p className="text-xs text-black/30 italic">None found</p>}
      </div>
    </div>
  );
}
