import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Download, Pause, Play, Square, Trash2, RefreshCw, Search, X, 
  Settings, Server, User, Lock, Folder, AlertTriangle, Monitor, 
  ChevronRight, Film, Tv, Info, CheckCircle2, AlertCircle
} from 'lucide-react';

// --- Types ---

interface Config {
  base_url: string;
  username: string;
  password: string;
  download_dir: string;
  user_agent: string;
  web_port: number;
}

interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface Item {
  name: string;
  stream_id?: number;
  series_id?: number;
  year?: string;
  display_year?: string;
  category_id?: string;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
}

interface DownloadItem {
  queue_id: string;
  item_id: string;
  title: string;
  stream_url: string;
  target_path: string;
  kind: string;
  status: string;
  progress: number;
  speed: number;
  downloaded_bytes: number;
  total_size: number;
  transient_errors: number;
  error?: string;
}

// --- API Helpers ---

const api = {
  getConfig: () => fetch('/api/config').then(r => r.json()),
  updateConfig: (config: Partial<Config>) => fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  }).then(r => r.json()),
  getUAPresets: () => fetch('/api/common-user-agents').then(r => r.json()),
  testConnection: () => fetch('/api/test-connection').then(r => r.json()),
  getCategories: (kind: 'movies' | 'series') => fetch(`/api/categories/${kind}`).then(r => r.json()),
  getItems: (kind: 'movies' | 'series', catId: string) => fetch(`/api/items/${kind}/${catId}`).then(r => r.json()),
  getSeriesInfo: (seriesId: string) => fetch(`/api/series/${seriesId}`).then(r => r.json()),
  getQueue: () => fetch('/api/queue').then(r => r.json()),
  addToQueue: (items: any[]) => fetch('/api/queue/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  }).then(r => r.json()),
  controlQueue: (action: string) => fetch(`/api/queue/control/${action}`, { method: 'POST' }).then(r => r.json()),
  removeFromQueue: (queueId: string) => fetch(`/api/queue/${queueId}`, { method: 'DELETE' }).then(r => r.json()),
};

// --- Utilities ---

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatSpeed = (bps: number) => {
  if (bps <= 0) return '';
  return `${formatSize(bps)}/s`;
};

// --- Components ---

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [uaPresets, setUAPresets] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'movies' | 'series'>('movies');
  const [categories, setCategories] = useState<Category[]>([]);
  const [catFilter, setCatFilter] = useState('');
  const [selectedCat, setSelectedCat] = useState('0');
  const [items, setItems] = useState<Item[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorStats, setErrorStats] = useState({ count: 0, last: '' });
  const [errorHistory, setErrorHistory] = useState<number[]>([]);
  
  // Refs for polling
  const queuePollRef = useRef<any>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await api.getConfig();
      setConfig(data);
      const presets = await api.getUAPresets();
      setUAPresets(presets);
    } catch (err) {
      console.error('Failed to fetch config', err);
    }
  }, []);

  const fetchCategories = useCallback(async (kind: 'movies' | 'series') => {
    try {
      const data = await api.getCategories(kind);
      setCategories(data);
    } catch (err) {
      console.error('Failed to fetch categories', err);
    }
  }, []);

  const fetchItems = useCallback(async (kind: 'movies' | 'series', catId: string) => {
    setLoading(true);
    try {
      const data = await api.getItems(kind, catId);
      setItems(data);
    } catch (err) {
      console.error('Failed to fetch items', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const data = await api.getQueue();
      setQueue(data);
      
      // Calculate transient errors from queue
      let totalTransient = 0;
      let latestTime = '';
      const newErrors: number[] = [];
      
      data.forEach((item: DownloadItem) => {
        if (item.transient_errors > 0) {
          totalTransient += item.transient_errors;
        }
        if (item.status === 'failed') {
          totalTransient += 1;
        }
      });
      
      // For the sake of the web UI demo, we'll just track total failures we see
      // In a real app we'd get this from a dedicated backend event stream
    } catch (err) {
      console.error('Failed to fetch queue', err);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchQueue();
    queuePollRef.current = setInterval(fetchQueue, 2000);
    return () => clearInterval(queuePollRef.current);
  }, [fetchConfig, fetchQueue]);

  useEffect(() => {
    fetchCategories(activeTab);
    setSelectedCat('0');
  }, [activeTab, fetchCategories]);

  useEffect(() => {
    if (selectedCat) {
      fetchItems(activeTab, selectedCat);
    }
  }, [selectedCat, activeTab, fetchItems]);

  const filteredCats = categories.filter(c => 
    c.category_name.toLowerCase().includes(catFilter.toLowerCase())
  );

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    try {
      await api.updateConfig(config);
      alert('Settings saved');
      fetchCategories(activeTab);
    } catch (err) {
      alert('Failed to save settings');
    }
  };

  const handleAddToQueue = async (item: Item) => {
    // Basic implementation for movies
    if (activeTab === 'movies') {
      const streamUrl = `${config?.base_url}/movie/${config?.username}/${config?.password}/${item.stream_id}.mp4`;
      // We'd ideally let backend handle path construction but for now:
      const targetPath = `${config?.download_dir}/Movies/${item.name}.mp4`;
      
      await api.addToQueue([{
        item_id: item.stream_id,
        title: item.name,
        stream_url: streamUrl,
        target_path: targetPath,
        kind: 'movie'
      }]);
    } else {
      // For series we'd need to show season dialog
      alert('Series selection not fully implemented in this MVP');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden text-sm">
      {/* Header / Config Bar */}
      <header className="bg-white border-b p-4 shadow-sm">
        <form onSubmit={handleSaveConfig} className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Server size={12}/> URL</label>
            <input 
              className="border rounded px-2 py-1 w-64 bg-gray-50 focus:bg-white"
              value={config?.base_url || ''} 
              onChange={e => setConfig({...config!, base_url: e.target.value})}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><User size={12}/> User</label>
            <input 
              className="border rounded px-2 py-1 w-32 bg-gray-50 focus:bg-white"
              value={config?.username || ''} 
              onChange={e => setConfig({...config!, username: e.target.value})}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Lock size={12}/> Pass</label>
            <input 
              type="password"
              className="border rounded px-2 py-1 w-32 bg-gray-50 focus:bg-white"
              value={config?.password || ''} 
              onChange={e => setConfig({...config!, password: e.target.value})}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Folder size={12}/> Downloads</label>
            <input 
              className="border rounded px-2 py-1 w-64 bg-gray-50 focus:bg-white"
              value={config?.download_dir || ''} 
              onChange={e => setConfig({...config!, download_dir: e.target.value})}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Monitor size={12}/> User-Agent</label>
            <select 
              className="border rounded px-2 py-1 w-48 bg-gray-50 focus:bg-white"
              value={Object.values(uaPresets).includes(config?.user_agent || '') ? config?.user_agent : 'custom'}
              onChange={e => {
                if (e.target.value !== 'custom') setConfig({...config!, user_agent: e.target.value});
              }}
            >
              {Object.entries(uaPresets).map(([label, val]) => (
                <option key={label} value={val}>{label}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
              <Settings size={16}/> Save
            </button>
            <button type="button" onClick={() => api.testConnection().then(r => alert(r.message))} className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded font-medium hover:bg-gray-300 transition-colors">
              Test
            </button>
            <button type="button" onClick={() => fetchCategories(activeTab)} className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded font-medium hover:bg-gray-300 transition-colors">
              <RefreshCw size={16}/>
            </button>
          </div>
        </form>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r flex flex-col">
          <div className="p-4 border-b flex flex-col gap-3">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button 
                onClick={() => setActiveTab('movies')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md transition-all ${activeTab === 'movies' ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Film size={16}/> Movies
              </button>
              <button 
                onClick={() => setActiveTab('series')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md transition-all ${activeTab === 'series' ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Tv size={16}/> Series
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input 
                placeholder="Filter categories..."
                className="w-full pl-8 pr-8 py-2 bg-gray-100 rounded-md focus:bg-white border-transparent focus:border-blue-300 outline-none border transition-all"
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
              />
              {catFilter && (
                <button onClick={() => setCatFilter('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                  <X size={14}/>
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button 
              onClick={() => setSelectedCat('0')}
              className={`w-full text-left px-4 py-2 hover:bg-gray-50 border-l-4 transition-all ${selectedCat === '0' ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium' : 'border-transparent text-gray-600'}`}
            >
              All Categories
            </button>
            {filteredCats.map(cat => (
              <button 
                key={cat.category_id}
                onClick={() => setSelectedCat(cat.category_id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 border-l-4 transition-all flex items-center justify-between group ${selectedCat === cat.category_id ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium' : 'border-transparent text-gray-600'}`}
              >
                <span className="truncate">{cat.category_name}</span>
                <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-opacity ${selectedCat === cat.category_id ? 'opacity-100' : ''}`} />
              </button>
            ))}
          </div>
        </aside>

        {/* Item Content */}
        <section className="flex-1 flex flex-col bg-white">
          <div className="p-4 border-b flex items-center justify-between bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              {activeTab === 'movies' ? <Film size={20}/> : <Tv size={20}/>}
              {categories.find(c => c.category_id === selectedCat)?.category_name || 'All Categories'}
              <span className="text-sm font-normal text-gray-500 ml-2">({filteredItems.length} items)</span>
            </h2>
            <div className="relative w-80">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input 
                placeholder={`Search ${activeTab}...`}
                className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 focus:border-blue-400 outline-none transition-all shadow-sm"
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-500 animate-pulse flex-col gap-2">
                <RefreshCw size={32} className="animate-spin" />
                <span>Loading catalog...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {filteredItems.map((item, idx) => (
                  <div key={idx} className="border rounded-xl overflow-hidden bg-white hover:shadow-md transition-all group flex flex-col border-gray-200">
                    <div className="aspect-[2/3] bg-gray-200 relative overflow-hidden">
                      {item.cover ? (
                        <img src={item.cover} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          {activeTab === 'movies' ? <Film size={48}/> : <Tv size={48}/>}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <button 
                          onClick={() => handleAddToQueue(item)}
                          className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-500"
                        >
                          <Download size={18}/> Queue
                        </button>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-bold text-gray-800 line-clamp-1" title={item.name}>{item.name}</h3>
                      <p className="text-gray-500 text-xs mt-1">{item.display_year || item.year || 'N/A'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Queue Drawer */}
      <footer className="h-72 bg-white border-t flex flex-col shadow-2xl z-10">
        <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h3 className="font-bold text-gray-700 flex items-center gap-2">
              <Download size={18} className="text-blue-600"/> Download Queue
            </h3>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="text-gray-500">Total: <span className="text-gray-900">{queue.length}</span></span>
              <span className="text-blue-600">Downloading: <span>{queue.filter(i => i.status === 'downloading').length}</span></span>
              <span className="text-red-600 font-bold flex items-center gap-2">
                HTTP Errors: {queue.reduce((acc, i) => acc + i.transient_errors + (i.status === 'failed' ? 1 : 0), 0)}
                {/* Timeline SVG Mockup */}
                <svg width="60" height="12" className="bg-gray-200 rounded">
                  {/* We would render vertical lines here */}
                </svg>
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => api.controlQueue('start')} className="flex items-center gap-1.5 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-xs font-bold">
              <Play size={12}/> Start
            </button>
            <button onClick={() => api.controlQueue('pause')} className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors text-xs font-bold">
              <Pause size={12}/> Pause
            </button>
            <button onClick={() => api.controlQueue('stop')} className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs font-bold">
              <Square size={12}/> Stop
            </button>
            <button onClick={() => api.controlQueue('clear-completed')} className="flex items-center gap-1.5 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-xs font-bold">
              <Trash2 size={12}/> Clear Done
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-2 border-b font-bold text-gray-600">Title</th>
                <th className="px-4 py-2 border-b font-bold text-gray-600">Type</th>
                <th className="px-4 py-2 border-b font-bold text-gray-600">Status</th>
                <th className="px-4 py-2 border-b font-bold text-gray-600">Speed</th>
                <th className="px-4 py-2 border-b font-bold text-gray-600">Progress</th>
                <th className="px-4 py-2 border-b font-bold text-gray-600 w-16 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map(item => (
                <tr key={item.queue_id} className="hover:bg-gray-50 border-b border-gray-100 group">
                  <td className="px-4 py-3 font-medium text-gray-800 flex items-center gap-2">
                    {item.status === 'completed' ? <CheckCircle2 size={14} className="text-green-500"/> : 
                     item.status === 'failed' ? <AlertCircle size={14} className="text-red-500"/> :
                     item.status === 'downloading' ? <Download size={14} className="text-blue-500 animate-bounce"/> :
                     <div className="w-3.5 h-3.5 rounded-full bg-gray-200"/>}
                    {item.title}
                  </td>
                  <td className="px-4 py-3 text-gray-500 uppercase text-[10px] tracking-wider font-bold">{item.kind}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      item.status === 'completed' ? 'bg-green-100 text-green-700' :
                      item.status === 'downloading' ? 'bg-blue-100 text-blue-700' :
                      item.status === 'failed' ? 'bg-red-100 text-red-700' :
                      item.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600 font-bold">{formatSpeed(item.speed)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 relative overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${item.status === 'completed' ? 'bg-green-500' : 'bg-blue-600'}`}
                          style={{ width: `${item.progress * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-600 min-w-[140px]">
                        {item.total_size > 0 ? (
                          `${formatSize(item.downloaded_bytes)} / ${formatSize(item.total_size)} (${Math.round(item.progress * 100)}%)`
                        ) : (
                          `${formatSize(item.downloaded_bytes)} (${Math.round(item.progress * 100)}%)`
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => api.removeFromQueue(item.queue_id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                    >
                      <Trash2 size={16}/>
                    </button>
                  </td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Info size={32} className="mx-auto mb-2 opacity-20"/>
                    Download queue is empty
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </footer>
    </div>
  );
}
