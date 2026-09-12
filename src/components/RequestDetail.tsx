import React, { useState } from 'react';
import { 
  X, 
  Clock, 
  Database, 
  Globe, 
  Shield, 
  Code, 
  Terminal, 
  Check, 
  Copy, 
  Image as ImageIcon,
  ExternalLink,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HAREntry } from '../types';
import { cn } from '../lib/utils';

interface RequestDetailProps {
  entry: HAREntry | null;
  onClose: () => void;
}

export default function RequestDetail({ entry, onClose }: RequestDetailProps) {
  if (!entry) return null;

  const [activeTab, setActiveTab] = useState<'headers' | 'payload' | 'response' | 'cookies' | 'timing'>('headers');
  const [curlCopied, setCurlCopied] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const tabs = [
    { id: 'headers' as const, label: 'Headers', icon: <Globe className="w-4 h-4" /> },
    { 
      id: 'payload' as const, 
      label: 'Payload', 
      icon: <Database className="w-4 h-4" />, 
      hidden: !entry.request.postData && entry.request.queryString.length === 0 
    },
    { id: 'response' as const, label: 'Response', icon: <Code className="w-4 h-4" /> },
    { 
      id: 'cookies' as const, 
      label: 'Cookies', 
      icon: <Shield className="w-4 h-4" />, 
      hidden: entry.request.cookies.length === 0 && entry.response.cookies.length === 0 
    },
    { id: 'timing' as const, label: 'Timing', icon: <Clock className="w-4 h-4" /> },
  ];

  const formatJSON = (text: string | undefined) => {
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(label);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleCopyCurl = () => {
    let cmd = `curl '${entry.request.url.replace(/'/g, "'\\''")}' \\\n`;
    if (entry.request.method !== 'GET') {
      cmd += `  -X ${entry.request.method} \\\n`;
    }
    entry.request.headers.forEach(h => {
      if (!h.name.startsWith(':')) {
        cmd += `  -H '${h.name}: ${h.value.replace(/'/g, "'\\''")}' \\\n`;
      }
    });
    if (entry.request.postData?.text) {
      cmd += `  --data-raw '${entry.request.postData.text.replace(/'/g, "'\\''")}' \\\n`;
    }
    cmd += `  --compressed`;

    navigator.clipboard.writeText(cmd);
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2000);
  };

  const isImageResponse = entry.response.content.mimeType?.toLowerCase().startsWith('image/');
  const imageSource = isImageResponse && entry.response.content.text
    ? (entry.response.content.encoding === 'base64'
        ? `data:${entry.response.content.mimeType};base64,${entry.response.content.text}`
        : entry.response.content.text)
    : null;

  // Timing segments definitions
  const timingBreakdown = [
    { key: 'blocked', label: 'Blocked / Queueing', value: entry.timings.blocked, color: 'bg-slate-400', textColor: 'text-slate-600', desc: 'Time spent in browser socket queue or stalled' },
    { key: 'dns', label: 'DNS Lookup', value: entry.timings.dns, color: 'bg-teal-500', textColor: 'text-teal-600', desc: 'Time resolving domain name' },
    { key: 'connect', label: 'Initial Connection', value: entry.timings.connect, color: 'bg-amber-500', textColor: 'text-amber-600', desc: 'TCP handshake duration' },
    { key: 'ssl', label: 'SSL / TLS Handshake', value: entry.timings.ssl, color: 'bg-purple-500', textColor: 'text-purple-600', desc: 'TLS negotiation & certificate check' },
    { key: 'send', label: 'Request Sent', value: entry.timings.send, color: 'bg-pink-500', textColor: 'text-pink-600', desc: 'Time spent sending HTTP request to wire' },
    { key: 'wait', label: 'Waiting for Response (TTFB)', value: entry.timings.wait, color: 'bg-emerald-500', textColor: 'text-emerald-600', desc: 'Time waiting for first byte from server' },
    { key: 'receive', label: 'Content Download', value: entry.timings.receive, color: 'bg-blue-500', textColor: 'text-blue-600', desc: 'Time downloading response payload' },
  ].filter(t => typeof t.value === 'number' && t.value > 0);

  const totalTimingSum = timingBreakdown.reduce((sum, t) => sum + (t.value || 0), 0) || entry.time || 1;

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
            <div className="min-w-0 pr-4">
              <h2 className="text-base font-bold truncate select-all" title={entry.request.url}>
                {entry.request.url}
              </h2>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                  entry.response.status >= 500 ? "bg-red-600 text-white" :
                  entry.response.status >= 400 ? "bg-orange-500 text-white" :
                  entry.response.status >= 300 ? "bg-blue-500 text-white" : "bg-emerald-500 text-white"
                )}>
                  {entry.response.status} {entry.response.statusText}
                </span>
                <span className="text-[10px] font-mono text-white/60 uppercase">
                  {entry.request.method} • {entry.request.httpVersion || 'HTTP'}
                </span>
                <span className="text-[10px] font-mono text-white/40">
                  {Math.round(entry.time)}ms
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopyCurl}
                title="Copy as cURL command"
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors border",
                  curlCopied
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-white/10 hover:bg-white/20 text-white/90 border-white/10"
                )}
              >
                {curlCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Terminal className="w-3.5 h-3.5" />}
                <span>{curlCopied ? 'Copied cURL' : 'cURL'}</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-black/5 bg-black/[0.02] overflow-x-auto scrollbar-hide">
            {tabs.filter(t => !t.hidden).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-6 py-3.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors shrink-0",
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

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* HEADERS TAB */}
            {activeTab === 'headers' && (
              <div className="space-y-6">
                <DetailSection title="General" data={[
                  { label: 'Request URL', value: entry.request.url },
                  { label: 'Request Method', value: entry.request.method },
                  { label: 'Status Code', value: `${entry.response.status} ${entry.response.statusText}` },
                  { label: 'Remote Address', value: entry.serverIPAddress || 'N/A' },
                  { label: 'HTTP Version', value: entry.response.httpVersion || entry.request.httpVersion || 'N/A' },
                  { label: 'Referrer Policy', value: entry.request.headers.find(h => h.name.toLowerCase() === 'referrer-policy')?.value || 'N/A' },
                ]} />

                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Response Headers ({entry.response.headers.length})</h3>
                    <button
                      onClick={() => copyToClipboard(entry.response.headers.map(h => `${h.name}: ${h.value}`).join('\n'), 'resp-headers')}
                      className="text-[11px] font-mono text-black/50 hover:text-black flex items-center gap-1"
                    >
                      {copiedSection === 'resp-headers' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copiedSection === 'resp-headers' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <DetailSection data={entry.response.headers} isList />
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Request Headers ({entry.request.headers.length})</h3>
                    <button
                      onClick={() => copyToClipboard(entry.request.headers.map(h => `${h.name}: ${h.value}`).join('\n'), 'req-headers')}
                      className="text-[11px] font-mono text-black/50 hover:text-black flex items-center gap-1"
                    >
                      {copiedSection === 'req-headers' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copiedSection === 'req-headers' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <DetailSection data={entry.request.headers} isList />
                </div>
              </div>
            )}

            {/* PAYLOAD TAB */}
            {activeTab === 'payload' && (
              <div className="space-y-6">
                {entry.request.queryString.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Query String Parameters</h3>
                    <DetailSection data={entry.request.queryString} isList />
                  </div>
                )}

                {entry.request.postData && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Request Body</h3>
                      {entry.request.postData.text && (
                        <button
                          onClick={() => copyToClipboard(entry.request.postData?.text || '', 'payload')}
                          className="text-[11px] font-mono text-black/50 hover:text-black flex items-center gap-1"
                        >
                          {copiedSection === 'payload' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          {copiedSection === 'payload' ? 'Copied' : 'Copy Payload'}
                        </button>
                      )}
                    </div>
                    <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5 space-y-2">
                      <p className="text-xs text-black/40 font-mono">MIME Type: {entry.request.postData.mimeType}</p>
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
                        <p className="text-xs text-black/40 italic">No text or parameters in postData</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RESPONSE TAB */}
            {activeTab === 'response' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Response Body</h3>
                    <p className="text-[11px] text-black/40 font-mono mt-0.5">
                      {entry.response.content.mimeType || 'unknown'} • {entry.response.content.size} bytes
                    </p>
                  </div>
                  {entry.response.content.text && (
                    <button
                      onClick={() => copyToClipboard(entry.response.content.text || '', 'response-body')}
                      className="text-[11px] font-mono text-black/50 hover:text-black flex items-center gap-1"
                    >
                      {copiedSection === 'response-body' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copiedSection === 'response-body' ? 'Copied' : 'Copy Response'}
                    </button>
                  )}
                </div>

                {/* Image visual preview if image response */}
                {imageSource && (
                  <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-black/70">
                      <ImageIcon className="w-4 h-4 text-purple-500" />
                      Image Preview
                    </div>
                    <div className="p-4 bg-white rounded-xl border border-black/5 flex items-center justify-center min-h-[160px] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
                      <img 
                        src={imageSource} 
                        alt="HAR Response Preview" 
                        className="max-h-[300px] max-w-full object-contain rounded shadow-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Text / JSON preview */}
                <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5">
                  {entry.response.content.text ? (
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white p-4 rounded-xl border border-black/5 max-h-[500px] overflow-y-auto">
                      {formatJSON(entry.response.content.text)}
                    </pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-black/30">
                      <Database className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-xs italic">Response body not recorded in HAR</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* COOKIES TAB */}
            {activeTab === 'cookies' && (
              <div className="space-y-6">
                {entry.response.cookies.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Response Cookies ({entry.response.cookies.length})</h3>
                    <DetailSection data={entry.response.cookies.map(c => ({ name: c.name, value: c.value }))} isList />
                  </div>
                )}
                {entry.request.cookies.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Request Cookies ({entry.request.cookies.length})</h3>
                    <DetailSection data={entry.request.cookies.map(c => ({ name: c.name, value: c.value }))} isList />
                  </div>
                )}
                {entry.response.cookies.length === 0 && entry.request.cookies.length === 0 && (
                  <p className="text-xs text-black/40 italic">No cookies associated with this request.</p>
                )}
              </div>
            )}

            {/* TIMING TAB */}
            {activeTab === 'timing' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">Phased Timing Breakdown</h3>
                  <p className="text-xs text-black/40 mt-1">Detailed breakdown of connection, TTFB, and download phases.</p>
                </div>

                {/* Stacked Phased Bar */}
                <div className="space-y-2">
                  <div className="h-6 w-full rounded-lg overflow-hidden flex bg-black/5 border border-black/5 shadow-inner">
                    {timingBreakdown.map(t => {
                      const pct = Math.max(((t.value || 0) / totalTimingSum) * 100, 1.5);
                      return (
                        <div
                          key={t.key}
                          style={{ width: `${pct}%` }}
                          className={cn("h-full transition-all relative group cursor-pointer", t.color)}
                          title={`${t.label}: ${Math.round(t.value || 0)}ms`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono font-bold pt-1">
                    <span className="text-black/50">Total Elapsed</span>
                    <span>{Math.round(entry.time)} ms</span>
                  </div>
                </div>

                {/* Phased Timing Rows */}
                <div className="space-y-3">
                  {timingBreakdown.map(t => (
                    <div key={t.key} className="p-3.5 rounded-xl bg-black/[0.02] border border-black/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-3 h-3 rounded-full shrink-0", t.color)} />
                        <div>
                          <div className="text-xs font-bold text-black/80">{t.label}</div>
                          <div className="text-[11px] text-black/40 mt-0.5">{t.desc}</div>
                        </div>
                      </div>
                      <span className={cn("text-xs font-mono font-bold shrink-0", t.textColor)}>
                        {Math.round(t.value || 0)} ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function DetailSection({ title, data, isList }: { title?: string; data: any[]; isList?: boolean }) {
  if (data.length === 0) return null;
  return (
    <div className="space-y-2">
      {title && <h3 className="text-xs font-mono uppercase tracking-widest text-black/40 font-bold">{title}</h3>}
      <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5 space-y-2">
        {data.map((item, i) => (
          <div key={i} className="grid grid-cols-[140px_1fr] gap-4 py-1.5 border-b border-black/[0.03] last:border-0 items-start">
            <span className="text-xs font-bold text-black/60 break-all select-all">
              {isList ? item.name : item.label}
            </span>
            <span className="text-xs font-mono text-black/80 break-all select-all">
              {isList ? item.value : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
