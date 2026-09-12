import React, { useState, useCallback, useRef, useDeferredValue, useMemo } from 'react';
import { 
  Upload, 
  FileJson, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  HardDrive, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  Search,
  Activity,
  Zap,
  ShieldAlert,
  Info,
  ExternalLink,
  Download,
  FileText,
  Filter,
  Layers,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { HARData, HAREntry, AnalysisResult } from './types';
import { analyzeHARWithAI } from './services/aiService';
import { exportToMarkdown, exportToPdf } from './utils/exportReport';
import ChatBox from './components/ChatBox';
import RequestDetail from './components/RequestDetail';

type ResourceTypeFilter = 'all' | 'xhr' | 'js' | 'css' | 'img' | 'media' | 'font' | 'doc' | 'other';

function getResourceType(entry: HAREntry): ResourceTypeFilter {
  const mime = (entry.response.content.mimeType || '').toLowerCase();
  const url = entry.request.url.toLowerCase().split('?')[0];

  if (mime.includes('javascript') || mime.includes('ecmascript') || url.endsWith('.js') || url.endsWith('.mjs')) {
    return 'js';
  }
  if (mime.includes('text/css') || url.endsWith('.css')) {
    return 'css';
  }
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|avif)$/.test(url)) {
    return 'img';
  }
  if (mime.startsWith('audio/') || mime.startsWith('video/') || /\.(mp3|mp4|webm|ogg|wav|mov)$/.test(url)) {
    return 'media';
  }
  if (mime.includes('font') || /\.(woff2?|ttf|otf|eot)$/.test(url)) {
    return 'font';
  }
  if (mime.includes('text/html') || url.endsWith('.html') || url.endsWith('.htm')) {
    return 'doc';
  }
  if (
    mime.includes('json') || 
    mime.includes('xml') || 
    entry.request.headers.some(h => h.name.toLowerCase() === 'x-requested-with' || (h.name.toLowerCase() === 'sec-fetch-dest' && h.value === 'empty'))
  ) {
    return 'xhr';
  }
  return 'other';
}

export default function App() {
  const [harData, setHarData] = useState<HARData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const [filter, setFilter] = useState<'all' | 'errors' | 'slow' | '2xx' | '3xx'>('all');
  const [typeFilter, setTypeFilter] = useState<ResourceTypeFilter>('all');
  const [sortField, setSortField] = useState<keyof HAREntry | 'url' | 'status' | 'method' | 'size' | 'time'>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedEntry, setSelectedEntry] = useState<HAREntry | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string>('all');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.har')) {
      setError('Please upload a valid .har file');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const text = await file.text();
      const parsed: HARData = JSON.parse(text);
      setHarData(parsed);
      
      if (parsed.log.pages && parsed.log.pages.length > 0) {
        setSelectedPageId('all');
      } else {
        setSelectedPageId('');
      }
      
      const aiResult = await analyzeHARWithAI(parsed);
      setAnalysis(aiResult);
    } catch (err) {
      setError('Failed to parse HAR file. Ensure it is a valid JSON format.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  // Compute counts per resource type
  const typeCounts = useMemo(() => {
    const counts: Record<ResourceTypeFilter, number> = {
      all: 0,
      xhr: 0,
      js: 0,
      css: 0,
      img: 0,
      media: 0,
      font: 0,
      doc: 0,
      other: 0
    };
    if (!harData) return counts;
    counts.all = harData.log.entries.length;
    for (const entry of harData.log.entries) {
      const t = getResourceType(entry);
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [harData]);

  const filteredEntries = useMemo(() => {
    if (!harData) return [];

    const searchTermLower = deferredSearchTerm.toLowerCase();

    return harData.log.entries.filter(entry => {
      const matchesSearch = !searchTermLower ? true : (
        entry.request.url.toLowerCase().includes(searchTermLower) ||
        entry.request.headers.some(h => h.name.toLowerCase().includes(searchTermLower) || h.value.toLowerCase().includes(searchTermLower)) ||
        entry.response.content.text?.toLowerCase().includes(searchTermLower)
      );
      
      const matchesFilter = 
        filter === 'all' ? true :
        filter === 'errors' ? entry.response.status >= 400 :
        filter === 'slow' ? entry.time > 1000 :
        filter === '2xx' ? entry.response.status >= 200 && entry.response.status < 300 :
        filter === '3xx' ? entry.response.status >= 300 && entry.response.status < 400 : true;

      const matchesType = typeFilter === 'all' ? true : getResourceType(entry) === typeFilter;
      const matchesPage = !selectedPageId || selectedPageId === 'all' ? true : entry.pageref === selectedPageId;

      return matchesSearch && matchesFilter && matchesType && matchesPage;
    }).sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortField) {
        case 'url':
          valA = a.request.url;
          valB = b.request.url;
          break;
        case 'status':
          valA = a.response.status;
          valB = b.response.status;
          break;
        case 'method':
          valA = a.request.method;
          valB = b.request.method;
          break;
        case 'size':
          valA = a.response.content.size || 0;
          valB = b.response.content.size || 0;
          break;
        case 'time':
        default:
          valA = a.time;
          valB = b.time;
          break;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [harData, deferredSearchTerm, filter, typeFilter, selectedPageId, sortField, sortDirection]);

  const minStartTime = useMemo(() => {
    if (!filteredEntries.length) return 0;
    return Math.min(...filteredEntries.map(e => new Date(e.startedDateTime).getTime()));
  }, [filteredEntries]);

  const maxEndTime = useMemo(() => {
    if (!filteredEntries.length) return 1;
    return Math.max(...filteredEntries.map(e => new Date(e.startedDateTime).getTime() + e.time));
  }, [filteredEntries]);

  const totalDuration = useMemo(() => {
    return Math.max(maxEndTime - minStartTime, 1);
  }, [maxEndTime, minStartTime]);

  const getWaterfallStyle = (entry: HAREntry) => {
    const start = new Date(entry.startedDateTime).getTime();
    const offset = Math.max(0, ((start - minStartTime) / totalDuration) * 100);
    const width = Math.max((entry.time / totalDuration) * 100, 0.8);
    return {
      left: `${Math.min(offset, 99)}%`,
      width: `${Math.min(width, 100 - offset)}%`
    };
  };

  const getPhasedTimings = (entry: HAREntry) => {
    const b = Math.max(0, entry.timings.blocked || 0);
    const d = Math.max(0, entry.timings.dns || 0);
    const c = Math.max(0, entry.timings.connect || 0);
    const w = Math.max(0, entry.timings.wait || 0);
    const r = Math.max(0, entry.timings.receive || 0);
    const sum = b + d + c + w + r || entry.time || 1;

    return {
      blocked: b,
      dns: d,
      connect: c,
      wait: w,
      receive: r,
      blockedPct: (b / sum) * 100,
      dnsPct: (d / sum) * 100,
      connectPct: (c / sum) * 100,
      waitPct: (w / sum) * 100,
      receivePct: (r / sum) * 100,
    };
  };

  const currentPage = harData?.log.pages?.find(p => p.id === selectedPageId);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIndicator = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-3 h-3 text-black" /> : 
      <ChevronDown className="w-3 h-3 text-black" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: number) => {
    if (status >= 500) return 'text-red-500 bg-red-50';
    if (status >= 400) return 'text-orange-500 bg-orange-50';
    if (status >= 300) return 'text-blue-500 bg-blue-50';
    if (status >= 200) return 'text-emerald-500 bg-emerald-50';
    return 'text-gray-500 bg-gray-50';
  };

  const chartData: Array<{ name: string; value: number }> = harData ? Object.entries(
    harData.log.entries.reduce((acc: Record<string, number>, e) => {
      const mimeType = e.response.content.mimeType || 'unknown/unknown';
      const type = mimeType.split('/')[1]?.split(';')[0] || 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })) : [];

  return (
    <div className="min-h-screen bg-[#f8f9fa] selection:bg-black selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white shadow-sm">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">HAR Insight</h1>
            <p className="text-xs text-black/40 font-mono uppercase tracking-widest">Network Performance & AI Analyzer</p>
          </div>
        </div>
        
        {harData && (
          <div className="flex items-center gap-2 relative">
            {/* Export Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-black text-white hover:bg-black/80 transition-colors flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Export Report</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>

              {exportMenuOpen && (
                <div 
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-black/10 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                  onMouseLeave={() => setExportMenuOpen(false)}
                >
                  <button
                    onClick={() => {
                      if (analysis) exportToPdf(harData, analysis);
                      setExportMenuOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-black/80 hover:bg-black/5 flex items-center gap-2.5 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-red-500" />
                    <span>Export as PDF Report</span>
                  </button>
                  <button
                    onClick={() => {
                      if (analysis) exportToMarkdown(harData, analysis);
                      setExportMenuOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-black/80 hover:bg-black/5 flex items-center gap-2.5 transition-colors"
                  >
                    <Download className="w-4 h-4 text-blue-500" />
                    <span>Export Markdown (.md)</span>
                  </button>
                </div>
              )}
            </div>

            <button 
              onClick={() => {
                setHarData(null);
                setAnalysis(null);
                setSelectedPageId('all');
                setTypeFilter('all');
                setSearchTerm('');
              }}
              className="text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/5 transition-colors"
            >
              Clear Analysis
            </button>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {!harData ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mt-20"
          >
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="group relative border-2 border-dashed border-black/10 rounded-3xl p-12 text-center hover:border-black/20 hover:bg-white transition-all cursor-pointer overflow-hidden"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".har"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
              <div className="relative z-10 space-y-4">
                <div className="w-20 h-20 bg-black/5 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <Upload className="w-10 h-10 text-black/40" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Upload HAR File</h2>
                  <p className="text-black/40 mt-2">Drag and drop your .har file here or click to browse</p>
                </div>
                <div className="flex items-center justify-center gap-4 text-xs font-mono text-black/30 uppercase tracking-widest pt-4">
                  <span>Chrome</span>
                  <span>•</span>
                  <span>Firefox</span>
                  <span>•</span>
                  <span>Safari</span>
                  <span>•</span>
                  <span>Edge</span>
                </div>
              </div>
            </div>
            
            {loading && (
              <div className="mt-8 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="w-8 h-8 border-4 border-black/10 border-t-black rounded-full animate-spin" />
                </div>
                <p className="text-sm font-medium animate-pulse">Analyzing network traffic with AI...</p>
              </div>
            )}

            {error && (
              <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard 
                icon={<HardDrive className="w-5 h-5 text-blue-500" />}
                label="Total Requests"
                value={harData.log.entries.length}
                subValue={`${filteredEntries.length} currently shown`}
              />
              <SummaryCard 
                icon={<AlertCircle className="w-5 h-5 text-red-500" />}
                label="Failed Requests"
                value={analysis?.summary.failedRequests || harData.log.entries.filter(e => e.response.status >= 400).length}
                subValue={`${((analysis?.summary.failedRequests || 0) / (harData.log.entries.length || 1) * 100).toFixed(1)}% error rate`}
                trend="danger"
              />
              {analysis && (
                <>
                  <SummaryCard 
                    icon={<Clock className="w-5 h-5 text-emerald-500" />}
                    label="Avg Response Time"
                    value={`${Math.round(analysis.summary.avgResponseTime)}ms`}
                    subValue={`Total: ${(analysis.summary.totalTime / 1000).toFixed(1)}s`}
                  />
                  <SummaryCard 
                    icon={<Activity className="w-5 h-5 text-purple-500" />}
                    label="Total Payload"
                    value={formatSize(analysis.summary.totalSize || 0)}
                    subValue="Transferred bandwidth"
                  />
                </>
              )}
            </div>

            {/* Page Selector */}
            {harData.log.pages && harData.log.pages.length > 1 && (
              <section className="bg-white rounded-2xl p-4 border border-black/5 flex items-center gap-4 shadow-sm flex-wrap">
                <span className="text-xs font-bold text-black/40 uppercase tracking-widest px-2">Page Context:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedPageId('all')}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all border",
                      selectedPageId === 'all'
                        ? "bg-black text-white border-black shadow-sm" 
                        : "bg-white text-black/60 border-black/5 hover:border-black/20"
                    )}
                  >
                    All Pages ({harData.log.entries.length})
                  </button>
                  {harData.log.pages.map(page => (
                    <button
                      key={page.id}
                      onClick={() => setSelectedPageId(page.id)}
                      className={cn(
                        "px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all border",
                        selectedPageId === page.id 
                          ? "bg-black text-white border-black shadow-sm" 
                          : "bg-white text-black/60 border-black/5 hover:border-black/20"
                      )}
                    >
                      {page.title || page.id}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Issues */}
              <div className="lg:col-span-2 space-y-8">
                <section className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Identified Issues</h2>
                      <p className="text-xs text-black/40 mt-0.5">Automated detection of network failures and performance bottlenecks</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(!analysis?.issues || analysis.issues.length === 0) ? (
                      <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-3 text-emerald-700 text-sm">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span>No severe network anomalies detected in this HAR capture.</span>
                      </div>
                    ) : (
                      analysis.issues.map((issue, i) => (
                        <div key={i} className="flex gap-4 p-4 rounded-2xl bg-black/[0.02] border border-black/5">
                          <div className={cn(
                            "mt-1 w-2.5 h-2.5 rounded-full shrink-0",
                            issue.type === 'error' ? "bg-red-500" : 
                            issue.type === 'warning' ? "bg-orange-500" : "bg-blue-500"
                          )} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase",
                                issue.type === 'error' ? "bg-red-100 text-red-700" :
                                issue.type === 'warning' ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                              )}>
                                {issue.type}
                              </span>
                              <h3 className="font-bold text-sm text-black/90">{issue.title}</h3>
                            </div>
                            <p className="text-sm text-black/60 mt-1">{issue.description}</p>
                            {issue.affectedUrl && (
                              <p className="text-xs font-mono text-black/40 mt-2 truncate bg-black/[0.03] px-2 py-1 rounded">
                                {issue.affectedUrl}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              {/* Charts */}
              <div className="space-y-8">
                <section className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm h-fit">
                  <h2 className="text-lg font-bold mb-6">MIME Distribution</h2>
                  <div className="h-[230px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={75}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'][index % 6]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-1.5 max-h-[160px] overflow-y-auto">
                    {chartData.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-black/[0.03]">
                        <span className="text-black/60 capitalize truncate max-w-[150px]">{item.name}</span>
                        <span className="font-mono font-bold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            {/* Network Requests Section */}
            <section className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-black/5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">Network Requests</h2>
                    <p className="text-xs text-black/40 mt-0.5">
                      Showing {filteredEntries.length} of {harData.log.entries.length} requests
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                      <input 
                        type="text"
                        placeholder="Filter URL, Header, Body..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10 w-full sm:w-64"
                      />
                    </div>
                    <select 
                      value={filter}
                      onChange={(e) => setFilter(e.target.value as any)}
                      className="bg-black/5 px-3 py-2 rounded-xl text-sm focus:outline-none font-medium cursor-pointer"
                    >
                      <option value="all">All Statuses</option>
                      <option value="errors">Errors (4xx / 5xx)</option>
                      <option value="slow">Slow (&gt; 1s)</option>
                      <option value="2xx">Successful (2xx)</option>
                      <option value="3xx">Redirects (3xx)</option>
                    </select>
                  </div>
                </div>

                {/* Resource Type Filter Pills (DevTools style) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide text-xs">
                  <span className="text-black/40 font-mono text-[11px] uppercase mr-1">Type:</span>
                  {[
                    { id: 'all' as const, label: 'All' },
                    { id: 'xhr' as const, label: 'Fetch/XHR' },
                    { id: 'js' as const, label: 'JS' },
                    { id: 'css' as const, label: 'CSS' },
                    { id: 'img' as const, label: 'Img' },
                    { id: 'media' as const, label: 'Media' },
                    { id: 'font' as const, label: 'Font' },
                    { id: 'doc' as const, label: 'Doc' },
                    { id: 'other' as const, label: 'Other' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setTypeFilter(tab.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5",
                        typeFilter === tab.id
                          ? "bg-black text-white"
                          : "bg-black/[0.03] text-black/60 hover:bg-black/10"
                      )}
                    >
                      <span>{tab.label}</span>
                      <span className={cn(
                        "text-[10px] px-1 rounded font-mono",
                        typeFilter === tab.id ? "bg-white/20 text-white" : "bg-black/5 text-black/50"
                      )}>
                        {typeCounts[tab.id] || 0}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Phased Waterfall Legend */}
                <div className="flex items-center gap-4 text-[11px] font-mono text-black/50 pt-2 border-t border-black/5 overflow-x-auto">
                  <span className="font-bold text-black/60 uppercase">Phases:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />
                    <span>Blocked</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-teal-500 inline-block" />
                    <span>DNS</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                    <span>Connect</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                    <span>Waiting (TTFB)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                    <span>Download</span>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <div className="min-w-[1020px]">
                  <div className="grid grid-cols-[1fr_80px_80px_100px_80px_230px] gap-4 px-6 py-3 bg-black/[0.02] text-[10px] font-mono uppercase tracking-widest text-black/40 border-b border-black/5">
                    <button onClick={() => handleSort('url')} className="flex items-center gap-1 hover:text-black transition-colors text-left">
                      Request URL <SortIndicator field="url" />
                    </button>
                    <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-black transition-colors text-left px-2">
                      Status <SortIndicator field="status" />
                    </button>
                    <button onClick={() => handleSort('method')} className="flex items-center gap-1 hover:text-black transition-colors text-left px-2">
                      Method <SortIndicator field="method" />
                    </button>
                    <button onClick={() => handleSort('time')} className="flex items-center gap-1 hover:text-black transition-colors text-left px-2">
                      Time <SortIndicator field="time" />
                    </button>
                    <button onClick={() => handleSort('size')} className="flex items-center gap-1 hover:text-black transition-colors text-left px-2">
                      Size <SortIndicator field="size" />
                    </button>
                    <div className="px-2">Waterfall Timeline</div>
                  </div>

                  <div className="divide-y divide-black/5">
                    {filteredEntries.length === 0 ? (
                      <div className="py-16 text-center text-black/40 text-sm">
                        No requests matching current filter criteria.
                      </div>
                    ) : (
                      filteredEntries.map((entry, i) => {
                        const phases = getPhasedTimings(entry);
                        const hasBreakdown = (phases.dns + phases.connect + phases.wait + phases.receive) > 0;

                        return (
                          <div 
                            key={i} 
                            className="grid grid-cols-[1fr_80px_80px_100px_80px_230px] gap-4 px-6 py-3.5 hover:bg-black/[0.02] transition-colors items-center group/row cursor-pointer"
                            onClick={() => setSelectedEntry(entry)}
                          >
                            <div className="min-w-0">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEntry(entry);
                                }}
                                className="text-sm font-medium truncate text-left w-full hover:text-blue-600 transition-colors block" 
                                title={entry.request.url}
                              >
                                {entry.request.url}
                              </button>
                              <p className="text-[10px] text-black/40 mt-0.5 truncate font-mono">
                                {entry.response.content.mimeType || 'unknown'}
                              </p>
                            </div>

                            <div className="px-2">
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold font-mono",
                                getStatusColor(entry.response.status)
                              )}>
                                {entry.response.status}
                              </span>
                            </div>

                            <div className="text-[10px] font-mono font-bold text-black/60 px-2">
                              {entry.request.method}
                            </div>

                            <div className="flex items-center gap-2 px-2">
                              <span className={cn(
                                "text-xs font-mono font-medium",
                                entry.time > 1000 ? "text-orange-600 font-bold" : "text-black/70"
                              )}>
                                {Math.round(entry.time)}ms
                              </span>
                            </div>

                            <div className="text-xs font-mono text-black/60 px-2">
                              {formatSize(entry.response.content.size || 0)}
                            </div>

                            {/* Phased Multi-Color Waterfall Timeline */}
                            <div className="px-2 h-8 relative flex items-center">
                              <div className="absolute inset-x-2 h-0.5 bg-black/[0.04] rounded-full" />
                              
                              {currentPage && (
                                <>
                                  <div 
                                    className="absolute h-full w-px bg-blue-500/30 z-0"
                                    style={{ left: `${(currentPage.pageTimings.onContentLoad / totalDuration) * 100}%` }}
                                    title="DOM Content Loaded"
                                  />
                                  <div 
                                    className="absolute h-full w-px bg-red-500/30 z-0"
                                    style={{ left: `${(currentPage.pageTimings.onLoad / totalDuration) * 100}%` }}
                                    title="Page Load"
                                  />
                                </>
                              )}

                              <div 
                                className="absolute h-4 rounded overflow-hidden flex shadow-xs group/waterfall transition-transform hover:scale-y-125"
                                style={getWaterfallStyle(entry)}
                                title={`Total: ${Math.round(entry.time)}ms\nDNS: ${Math.round(phases.dns)}ms\nConnect: ${Math.round(phases.connect)}ms\nTTFB: ${Math.round(phases.wait)}ms\nDownload: ${Math.round(phases.receive)}ms`}
                              >
                                {hasBreakdown ? (
                                  <>
                                    {phases.blocked > 0 && <div style={{ width: `${phases.blockedPct}%` }} className="h-full bg-slate-400 shrink-0" />}
                                    {phases.dns > 0 && <div style={{ width: `${phases.dnsPct}%` }} className="h-full bg-teal-500 shrink-0" />}
                                    {phases.connect > 0 && <div style={{ width: `${phases.connectPct}%` }} className="h-full bg-amber-500 shrink-0" />}
                                    {phases.wait > 0 && <div style={{ width: `${phases.waitPct}%` }} className="h-full bg-emerald-500 shrink-0" />}
                                    {phases.receive > 0 && <div style={{ width: `${phases.receivePct}%` }} className="h-full bg-blue-500 shrink-0" />}
                                  </>
                                ) : (
                                  <div className="w-full h-full bg-blue-500/70" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* AI Advice Section */}
            <section className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white shadow-sm">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">AI Diagnostic Advice</h2>
                  <p className="text-xs text-black/40 mt-0.5">Automated recommendations synthesized by Gemini network intelligence</p>
                </div>
              </div>
              <div className="prose prose-sm max-w-none text-black/80 leading-relaxed">
                <ReactMarkdown>{analysis?.advice || ''}</ReactMarkdown>
              </div>
            </section>
          </div>
        )}
      </main>

      {harData && <ChatBox harData={harData} />}
      <RequestDetail entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}

function SummaryCard({ icon, label, value, subValue, trend }: { 
  icon: React.ReactNode, 
  label: string, 
  value: string | number, 
  subValue: string,
  trend?: 'success' | 'danger'
}) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="p-2 bg-black/[0.02] rounded-xl">
          {icon}
        </div>
        <span className="text-[10px] font-mono text-black/40 uppercase tracking-widest">{label}</span>
      </div>
      <div>
        <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
        <p className={cn(
          "text-xs mt-1 font-medium",
          trend === 'danger' ? "text-red-500" : "text-black/40"
        )}>{subValue}</p>
      </div>
    </div>
  );
}
