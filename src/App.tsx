import React, { useState, useCallback, useRef } from 'react';
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
  ExternalLink
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

export default function App() {
  const [harData, setHarData] = useState<HARData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'errors' | 'slow'>('all');
  const [sortField, setSortField] = useState<keyof HAREntry | 'url' | 'status' | 'method' | 'size' | 'time'>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
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

  const filteredEntries = harData?.log.entries.filter(entry => {
    const matchesSearch = entry.request.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = 
      filter === 'all' ? true :
      filter === 'errors' ? entry.response.status >= 400 :
      filter === 'slow' ? entry.time > 1000 : true;
    return matchesSearch && matchesFilter;
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
        valA = a.response.content.size;
        valB = b.response.content.size;
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
  }) || [];

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIndicator = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <div className="w-4 h-4" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: number) => {
    if (status >= 500) return 'text-red-600 bg-red-50';
    if (status >= 400) return 'text-orange-600 bg-orange-50';
    if (status >= 300) return 'text-blue-600 bg-blue-50';
    return 'text-green-600 bg-green-50';
  };

  const chartData: Array<{ name: string; value: number }> = harData ? Object.entries(
    harData.log.entries.reduce((acc: Record<string, number>, e) => {
      const type = e.response.content.mimeType.split('/')[1]?.split(';')[0] || 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })) : [];

  return (
    <div className="min-h-screen bg-[#f8f9fa] selection:bg-black selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">HAR Insight</h1>
            <p className="text-xs text-black/40 font-mono uppercase tracking-widest">Network Analyzer</p>
          </div>
        </div>
        
        {harData && (
          <button 
            onClick={() => {
              setHarData(null);
              setAnalysis(null);
            }}
            className="text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/5 transition-colors"
          >
            Clear Analysis
          </button>
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
                icon={<Zap className="w-5 h-5 text-yellow-500" />}
                label="Total Requests"
                value={analysis?.summary.totalRequests || 0}
                subValue="Network calls"
              />
              <SummaryCard 
                icon={<ShieldAlert className="w-5 h-5 text-red-500" />}
                label="Failed Requests"
                value={analysis?.summary.failedRequests || 0}
                subValue={`${((analysis?.summary.failedRequests || 0) / (analysis?.summary.totalRequests || 1) * 100).toFixed(1)}% failure rate`}
                trend="danger"
              />
              <SummaryCard 
                icon={<Clock className="w-5 h-5 text-blue-500" />}
                label="Avg Response"
                value={`${Math.round(analysis?.summary.avgResponseTime || 0)}ms`}
                subValue="Latency"
              />
              <SummaryCard 
                icon={<HardDrive className="w-5 h-5 text-purple-500" />}
                label="Total Payload"
                value={formatSize(analysis?.summary.totalSize || 0)}
                subValue="Transferred"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Issues */}
              <div className="lg:col-span-2 space-y-8">
                <section className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold">Identified Issues</h2>
                  </div>
                  <div className="space-y-4">
                    {analysis?.issues.map((issue, i) => (
                      <div key={i} className="flex gap-4 p-4 rounded-2xl bg-black/[0.02] border border-black/5">
                        <div className={cn(
                          "mt-1 w-2 h-2 rounded-full shrink-0",
                          issue.type === 'error' ? "bg-red-500" : 
                          issue.type === 'warning' ? "bg-orange-500" : "bg-blue-500"
                        )} />
                        <div>
                          <h3 className="font-bold text-sm">{issue.title}</h3>
                          <p className="text-sm text-black/50 mt-1">{issue.description}</p>
                          {issue.affectedUrl && (
                            <p className="text-xs font-mono text-black/30 mt-2 truncate max-w-md">
                              {issue.affectedUrl}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Charts */}
              <div className="space-y-8">
                <section className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm h-fit">
                  <h2 className="text-lg font-bold mb-6">Content Distribution</h2>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#000', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-2">
                    {chartData.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-black/50 capitalize">{item.name}</span>
                        <span className="font-bold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            {/* Request List */}
            <section className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-black/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-xl font-bold">Network Requests</h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                    <input 
                      type="text"
                      placeholder="Search URL..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/5 w-full sm:w-64"
                    />
                  </div>
                  <select 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as any)}
                    className="bg-black/5 px-3 py-2 rounded-xl text-sm focus:outline-none"
                  >
                    <option value="all">All</option>
                    <option value="errors">Errors (4xx/5xx)</option>
                    <option value="slow">Slow (&gt;1s)</option>
                  </select>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="grid grid-cols-[1fr_100px_100px_120px_100px] gap-4 px-6 py-3 bg-black/[0.02] text-[10px] font-mono uppercase tracking-widest text-black/40">
                    <button onClick={() => handleSort('url')} className="flex items-center gap-1 hover:text-black transition-colors text-left">
                      Request URL <SortIndicator field="url" />
                    </button>
                    <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-black transition-colors text-left">
                      Status <SortIndicator field="status" />
                    </button>
                    <button onClick={() => handleSort('method')} className="flex items-center gap-1 hover:text-black transition-colors text-left">
                      Method <SortIndicator field="method" />
                    </button>
                    <button onClick={() => handleSort('time')} className="flex items-center gap-1 hover:text-black transition-colors text-left">
                      Time <SortIndicator field="time" />
                    </button>
                    <button onClick={() => handleSort('size')} className="flex items-center gap-1 hover:text-black transition-colors text-left">
                      Size <SortIndicator field="size" />
                    </button>
                  </div>
                  <div className="divide-y divide-black/5">
                    {filteredEntries.map((entry, i) => (
                      <div key={i} className="grid grid-cols-[1fr_100px_100px_120px_100px] gap-4 px-6 py-4 hover:bg-black/[0.01] transition-colors items-center">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" title={entry.request.url}>
                            {entry.request.url}
                          </p>
                          <p className="text-[10px] text-black/30 mt-0.5 truncate">
                            {entry.response.content.mimeType}
                          </p>
                        </div>
                        <div>
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold",
                            getStatusColor(entry.response.status)
                          )}>
                            {entry.response.status}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono font-bold text-black/40">
                          {entry.request.method}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-black/5 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full",
                                entry.time > 1000 ? "bg-orange-500" : "bg-black/40"
                              )}
                              style={{ width: `${Math.min((entry.time / 2000) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-black/60">{Math.round(entry.time)}ms</span>
                        </div>
                        <div className="text-xs font-mono text-black/60">
                          {formatSize(entry.response.content.size)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* AI Advice */}
            <section className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
                  <Zap className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold">AI Diagnostic Advice</h2>
              </div>
              <div className="prose prose-sm max-w-none text-black/70">
                <ReactMarkdown>{analysis?.advice || ''}</ReactMarkdown>
              </div>
            </section>
          </div>
        )}
      </main>
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
        <span className="text-[10px] font-mono text-black/30 uppercase tracking-widest">{label}</span>
      </div>
      <div>
        <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
        <p className={cn(
          "text-xs mt-1",
          trend === 'danger' ? "text-red-500" : "text-black/40"
        )}>{subValue}</p>
      </div>
    </div>
  );
}
