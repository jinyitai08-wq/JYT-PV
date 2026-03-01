import React, { useState, useEffect, useRef } from 'react';
import { Activity, Settings, Sun, Zap, AlertCircle, CheckCircle, RefreshCw, Send, Trash2, Plus, Server, MapPin, Factory, BrainCircuit, Home, Bell, Wrench, BarChart2, FileText, Monitor, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import * as htmlToImage from 'html-to-image';
import Markdown from 'react-markdown';

interface TelemetryData {
  id: number;
  device_id: string;
  collector_name?: string;
  timestamp: string;
  power: number;
  energy_today: number;
  status: string;
}

interface ChartData {
  timestamp: string;
  power: number;
  energy_today: number;
}

interface Collector {
  id: number;
  name: string;
  device_id: string;
  description: string;
  location: string;
  plant: string;
  created_at: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'monitoring' | 'maintenance' | 'analysis' | 'reports' | 'dashboard' | 'system'>('overview');
  const [data, setData] = useState<TelemetryData[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  
  // History State
  const [historyData, setHistoryData] = useState<TelemetryData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');

  // AI Analysis State
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // New collector form state
  const [newCollector, setNewCollector] = useState({ name: '', device_id: '', description: '', location: '', plant: '' });
  const [formError, setFormError] = useState('');

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      const [resData, resChart] = await Promise.all([
        fetch('/api/telemetry?limit=50'),
        fetch('/api/telemetry/chart')
      ]);
      
      if (resData.ok) setData(await resData.json());
      if (resChart.ok) {
        const rawChart = await resChart.json();
        // Format time for chart
        const formattedChart = rawChart.map((d: any) => ({
          ...d,
          time: new Date(d.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
        }));
        setChartData(formattedChart);
      }
    } catch (error) {
      console.error('Failed to fetch telemetry data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCollectors = async () => {
    try {
      const res = await fetch('/api/collectors');
      if (res.ok) setCollectors(await res.json());
    } catch (error) {
      console.error('Failed to fetch collectors:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverviewData();
      const interval = setInterval(fetchOverviewData, 900000); // 15 minutes
      return () => clearInterval(interval);
    } else if (activeTab === 'system') {
      fetchCollectors();
    }
  }, [activeTab]);

  const fetchHistoryData = async () => {
    try {
      setHistoryLoading(true);
      let url = '/api/history?';
      if (historyStart) url += `start=${historyStart}T00:00:00&`;
      if (historyEnd) url += `end=${historyEnd}T23:59:59&`;
      
      const res = await fetch(url);
      if (res.ok) setHistoryData(await res.json());
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const simulatePush = async () => {
    try {
      setSimulating(true);
      
      // Use the first collector or a default if none exists
      const deviceId = collectors.length > 0 ? collectors[0].device_id : "ECU-1051-MAIN";
      
      // Generate realistic PV data (bell curve during day, zero at night)
      const hour = new Date().getHours();
      let power = 0;
      if (hour > 6 && hour < 18) {
        // Peak around 12-13
        const peakFactor = 1 - Math.abs(hour - 12) / 6;
        power = Math.max(0, Math.floor(peakFactor * 500 + (Math.random() * 50 - 25)));
      }
      
      // Accumulate energy
      const lastEnergy = chartData.length > 0 ? chartData[chartData.length - 1].energy_today : 0;
      const energyToday = lastEnergy + (power * (10 / 3600)); // Simulating 10s interval
      
      const payload = {
        device_id: deviceId,
        power: power,
        energy_today: parseFloat(energyToday.toFixed(2))
      };

      const envelope = {
        message: {
          data: btoa(JSON.stringify(payload)),
          messageId: Math.random().toString(36).substring(7),
          publishTime: new Date().toISOString(),
        }
      };

      await fetch('/push-handler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      });

      await fetchOverviewData();
    } catch (error) {
      console.error('Failed to simulate push:', error);
    } finally {
      setSimulating(false);
    }
  };

  const clearData = async () => {
    try {
      await fetch('/api/telemetry', { method: 'DELETE' });
      setData([]);
      setChartData([]);
      setAnalysisResult(null);
    } catch (error) {
      console.error('Failed to clear data:', error);
    }
  };

  const handleAddCollector = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      const res = await fetch('/api/collectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCollector)
      });
      
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || '新增失敗');
        return;
      }
      
      setNewCollector({ name: '', device_id: '', description: '', location: '', plant: '' });
      fetchCollectors();
    } catch (error) {
      setFormError('網路錯誤');
    }
  };

  const handleDeleteCollector = async (id: number) => {
    if (!confirm('確定要刪除此收集器嗎？')) return;
    try {
      await fetch(`/api/collectors/${id}`, { method: 'DELETE' });
      fetchCollectors();
    } catch (error) {
      console.error('Failed to delete collector:', error);
    }
  };

  const handleAnalyzeImage = async () => {
    if (!dashboardRef.current) return;
    
    try {
      setAnalyzing(true);
      setAnalysisResult(null);
      
      // Capture the dashboard as an image
      const dataUrl = await htmlToImage.toPng(dashboardRef.current, { 
        quality: 0.8,
        backgroundColor: '#f5f7fa'
      });
      
      // Send to backend for Gemini analysis
      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl })
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || '分析失敗');
      }
      
      setAnalysisResult(result.analysis);
    } catch (error: any) {
      console.error('Analysis failed:', error);
      setAnalysisResult(`**分析失敗**: ${error.message || '發生未知錯誤'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Calculate KPIs
  const currentPower = data.length > 0 ? data[0].power : 0;
  const todayEnergy = data.length > 0 ? data[0].energy_today : 0;
  const hasAnomaly = data.some(d => d.status === '異常');

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-slate-800 font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1e3a5f] text-slate-300 flex flex-col fixed h-full shadow-xl">
        <div className="p-6 flex items-center gap-3 text-white border-b border-[#2a4d7a]">
          <div className="bg-blue-500 p-2 rounded-lg">
            <Sun size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-wide">JYT-PV</h1>
            <p className="text-xs text-blue-200">智慧電站監控系統</p>
          </div>
        </div>
        
        <nav className="flex-1 py-6 space-y-1">
          {[
            { id: 'overview', label: '總覽', icon: Home },
            { id: 'monitoring', label: '監控', icon: Bell },
            { id: 'maintenance', label: '維運', icon: Wrench },
            { id: 'analysis', label: '分析', icon: BarChart2 },
            { id: 'reports', label: '報表', icon: FileText },
            { id: 'dashboard', label: '看板', icon: Monitor },
            { id: 'system', label: '系統管理', icon: Settings },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center justify-between px-6 py-4 transition-all ${
                activeTab === item.id 
                  ? 'bg-gradient-to-r from-blue-500/20 to-transparent text-white border-l-4 border-blue-400' 
                  : 'hover:bg-[#2a4d7a] hover:text-white border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-4">
                <item.icon size={20} />
                <span className="font-medium text-lg tracking-wider">{item.label}</span>
              </div>
              <div className="w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-r-4 border-r-slate-400 opacity-50"></div>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 sticky top-0 z-10">
          <h2 className="text-xl font-semibold text-slate-800">
            {activeTab === 'overview' && '電站總覽 (Plant Overview)'}
            {activeTab === 'monitoring' && '監控 (Monitoring)'}
            {activeTab === 'maintenance' && '維運 (Maintenance)'}
            {activeTab === 'analysis' && '分析 (Analysis)'}
            {activeTab === 'reports' && '報表與歷史資料 (Reports & History)'}
            {activeTab === 'dashboard' && '看板 (Dashboard)'}
            {activeTab === 'system' && '系統管理 (System Management)'}
          </h2>
          
          {activeTab === 'overview' && (
            <div className="flex items-center gap-3">
              <button 
                onClick={handleAnalyzeImage}
                disabled={analyzing || data.length === 0}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-indigo-600/20"
              >
                {analyzing ? <RefreshCw size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
                <span>AI 圖像分析</span>
              </button>
              <button 
                onClick={clearData}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                <span>清空數據</span>
              </button>
              <button 
                onClick={simulatePush}
                disabled={simulating}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-blue-600/20"
              >
                {simulating ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                <span>模擬接收數據</span>
              </button>
            </div>
          )}
        </header>

        <div className="p-8">
          {activeTab === 'overview' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              
              {/* AI Analysis Result */}
              {analysisResult && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-4 text-indigo-800">
                    <BrainCircuit size={24} />
                    <h3 className="text-lg font-bold">Gemini 3.1 Pro 數據圖像分析報告</h3>
                  </div>
                  <div className="prose prose-indigo max-w-none text-slate-700 text-sm">
                    <Markdown>{analysisResult}</Markdown>
                  </div>
                </motion.div>
              )}

              {/* Dashboard Content to be captured */}
              <div ref={dashboardRef} className="space-y-6 bg-[#f5f7fa] p-2 -m-2 rounded-xl">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-blue-600">
                      <Zap size={64} />
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <h3 className="text-sm font-medium">當前發電功率 (Current Power)</h3>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-slate-800">{currentPower}</span>
                      <span className="text-slate-500 font-medium">kW</span>
                    </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-600">
                      <Sun size={64} />
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <h3 className="text-sm font-medium">今日發電量 (Energy Today)</h3>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-slate-800">{todayEnergy.toFixed(2)}</span>
                      <span className="text-slate-500 font-medium">kWh</span>
                    </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <h3 className="text-sm font-medium">系統狀態 (System Status)</h3>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      {hasAnomaly ? (
                        <>
                          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                            <AlertCircle size={24} />
                          </div>
                          <div>
                            <p className="text-xl font-bold text-red-600">異常 (Warning)</p>
                            <p className="text-sm text-slate-500">偵測到發電異常</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <CheckCircle size={24} />
                          </div>
                          <div>
                            <p className="text-xl font-bold text-emerald-600">正常 (Normal)</p>
                            <p className="text-sm text-slate-500">所有設備運行中</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chart */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-slate-800">今日發電曲線 (Power Curve)</h3>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="text-slate-600">功率 (kW)</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-80 w-full">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                          />
                          <Area type="monotone" dataKey="power" name="功率 (kW)" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorPower)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        暫無數據 (No Data)
                      </div>
                    )}
                  </div>
                </div>

                {/* Data Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-800">最新接收數據 (Recent Telemetry)</h3>
                    <button onClick={fetchOverviewData} className="text-slate-400 hover:text-blue-600 transition-colors">
                      <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="px-6 py-4">時間 (Time)</th>
                          <th className="px-6 py-4">收集器名稱 (Collector)</th>
                          <th className="px-6 py-4">設備 ID (Device ID)</th>
                          <th className="px-6 py-4 text-right">功率 (Power)</th>
                          <th className="px-6 py-4 text-right">今日發電 (Energy)</th>
                          <th className="px-6 py-4 text-center">狀態 (Status)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                              尚未收到任何數據
                            </td>
                          </tr>
                        ) : (
                          data.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                                {new Date(row.timestamp).toLocaleString('zh-TW')}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">
                                {row.collector_name || '未知設備'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                                {row.device_id}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-medium text-right">
                                {row.power} kW
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right">
                                {row.energy_today} kWh
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                {row.status === '異常' ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                    異常
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                    正常
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
                  <FileText size={20} className="text-blue-600" />
                  歷史資料查詢 (Historical Data)
                </h3>
                
                <div className="flex flex-wrap items-end gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">開始日期</label>
                    <input 
                      type="date" 
                      value={historyStart}
                      onChange={e => setHistoryStart(e.target.value)}
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">結束日期</label>
                    <input 
                      type="date" 
                      value={historyEnd}
                      onChange={e => setHistoryEnd(e.target.value)}
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <button 
                    onClick={fetchHistoryData}
                    disabled={historyLoading}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {historyLoading ? <RefreshCw size={18} className="animate-spin" /> : <Search size={18} />}
                    查詢資料
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="px-6 py-4">時間 (Time)</th>
                        <th className="px-6 py-4">收集器名稱 (Collector)</th>
                        <th className="px-6 py-4">設備 ID (Device ID)</th>
                        <th className="px-6 py-4 text-right">功率 (Power)</th>
                        <th className="px-6 py-4 text-right">今日發電 (Energy)</th>
                        <th className="px-6 py-4 text-center">狀態 (Status)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyData.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                            請設定條件後點擊查詢，或目前無符合資料
                          </td>
                        </tr>
                      ) : (
                        historyData.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                              {new Date(row.timestamp).toLocaleString('zh-TW')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">
                              {row.collector_name || '未知設備'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                              {row.device_id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-medium text-right">
                              {row.power} kW
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right">
                              {row.energy_today} kWh
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {row.status === '異常' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">異常</span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">正常</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'system' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-8">
              {/* Add Collector Form */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
                  <Server size={20} className="text-blue-600" />
                  新增資料收集器 (Add Data Collector)
                </h3>
                
                <form onSubmit={handleAddCollector} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">收集器名稱 (Name)</label>
                      <input 
                        type="text" 
                        required
                        value={newCollector.name}
                        onChange={e => setNewCollector({...newCollector, name: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        placeholder="例如: 一廠屋頂收集器"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">設備 ID (Device ID / SN)</label>
                      <input 
                        type="text" 
                        required
                        value={newCollector.device_id}
                        onChange={e => setNewCollector({...newCollector, device_id: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                        placeholder="例如: ECU1051_SN001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <MapPin size={14} className="text-slate-400" /> 地點 (Location)
                      </label>
                      <input 
                        type="text" 
                        value={newCollector.location}
                        onChange={e => setNewCollector({...newCollector, location: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        placeholder="例如: 台北市內湖區"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <Factory size={14} className="text-slate-400" /> 設備廠房 (Plant)
                      </label>
                      <input 
                        type="text" 
                        value={newCollector.plant}
                        onChange={e => setNewCollector({...newCollector, plant: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        placeholder="例如: 內湖一廠"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">備註說明 (Description)</label>
                    <input 
                      type="text" 
                      value={newCollector.description}
                      onChange={e => setNewCollector({...newCollector, description: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="選填"
                    />
                  </div>
                  
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                  
                  <div className="flex justify-end pt-2">
                    <button 
                      type="submit"
                      className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <Plus size={18} />
                      新增設備
                    </button>
                  </div>
                </form>
              </div>

              {/* Collectors List */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                  <h3 className="font-semibold text-slate-800">已註冊的收集器列表 (Registered Collectors)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="px-6 py-4">名稱 (Name)</th>
                        <th className="px-6 py-4">設備 ID (Device ID)</th>
                        <th className="px-6 py-4">地點 (Location)</th>
                        <th className="px-6 py-4">廠房 (Plant)</th>
                        <th className="px-6 py-4">備註 (Description)</th>
                        <th className="px-6 py-4 text-right">操作 (Actions)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {collectors.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                            尚未設定任何收集器
                          </td>
                        </tr>
                      ) : (
                        collectors.map((collector) => (
                          <tr key={collector.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">
                              {collector.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                              {collector.device_id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                              {collector.location || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                              {collector.plant || '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              {collector.description || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <button 
                                onClick={() => handleDeleteCollector(collector.id)}
                                className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                                title="刪除設備"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {['monitoring', 'maintenance', 'analysis', 'dashboard'].includes(activeTab) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Wrench size={48} className="mb-4 opacity-20" />
              <h3 className="text-xl font-medium text-slate-500">功能建置中 (Coming Soon)</h3>
              <p className="mt-2 text-sm">此模組正在開發中，敬請期待。</p>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
