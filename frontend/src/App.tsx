import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Download, Pause, Play, Trash2, RefreshCw, Search, 
  Settings, Sun, Moon, Clock, 
  ChevronRight, Film, Tv, AlertCircle, AlertTriangle, Check,
  LayoutGrid, List, AlignJustify, Menu, GripVertical,
  Maximize2, Minimize2, MoveUp, ChevronDown, ChevronUp, Zap
} from 'lucide-react';

// --- Modular Imports ---
import { Config, Category, Item, DownloadItem, ViewMode } from './types';
import { api } from './api/client';
import { formatSize, formatSpeed, formatETA, sanitiseFilename, stripExtension } from './utils/format';

import { SafeImage } from './components/SafeImage';
import { Toast } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { LoginModal } from './components/LoginModal';
import { SetupWizard } from './components/SetupWizard';
import { SettingsModal } from './components/SettingsModal';
import { ItemDetailsModal } from './components/ItemDetailsModal';
import { EpisodeSelectorModal } from './components/EpisodeSelectorModal';

export default function App() {
  // Application State
  const [config, setConfig] = useState<Config | null>(null);
  const [version, setVersion] = useState<string>('');
  const [authStatus, setAuthStatus] = useState<{ is_authenticated: boolean, username?: string, bypass_active?: boolean } | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [uaPresets, setUAPresets] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'movies' | 'series'>('movies');
  const [categories, setCategories] = useState<Category[]>([]);
  const [catFilter, setCatFilter] = useState('');
  const [selectedCat, setSelectedCat] = useState('0');
  const [items, setItems] = useState<Item[]>([]);
  const [isItemsCached, setIsItemsCached] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [offset, setOffset] = useState(0);
  const [itemSearch, setItemSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<Item | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isQueueMaximized, setIsQueueMaximized] = useState(() => localStorage.getItem('queue-maximized') === 'true');
  const [isQueueMinimized, setIsQueueMinimized] = useState(() => localStorage.getItem('queue-minimized') === 'true');

  useEffect(() => {
    localStorage.setItem('queue-maximized', isQueueMaximized.toString());
  }, [isQueueMaximized]);

  useEffect(() => {
    localStorage.setItem('queue-minimized', isQueueMinimized.toString());
  }, [isQueueMinimized]);

  const toggleQueue = () => {
    if (isQueueMinimized) {
      setIsQueueMinimized(false);
      setIsQueueMaximized(false);
    } else if (isQueueMaximized) {
      setIsQueueMaximized(false);
      setIsQueueMinimized(false);
    } else {
      setIsQueueMaximized(true);
    }
  };

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('view-mode') as ViewMode) || 'compact');
  const [posterSize, setPosterSize] = useState(() => parseInt(localStorage.getItem('poster-size') || '160'));
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const handleCloseToast = useCallback(() => setToast(null), []);
  const [confirm, setConfirm] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);

  const LIMIT = 50;
  const queuePollRef = useRef<any>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await api.getConfig();
      setConfig(data);
      localStorage.setItem('vodarr_config', JSON.stringify(data));
    } catch (err) {
      console.error('Failed to fetch config', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const auth = await api.getAuthStatus();
        setAuthStatus(auth);
        
        // Fetch version regardless of auth (it's public)
        api.getVersion().then(v => setVersion(v.version)).catch(() => {});

        if (auth.is_authenticated) {
          fetchConfig();
          const presets = await api.getUAPresets();
          setUAPresets(presets);
        } else {
          setShowLogin(true);
        }
      } catch (err) {
        console.error('Auth check failed', err);
      }
    };
    init();
  }, [fetchConfig]);

  // Dark mode side effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('color-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('color-theme', 'light');
    }
  }, [isDarkMode]);

  // Fetch categories for the current tab (Movies or Series)
  const fetchCategories = useCallback(async (kind: 'movies' | 'series', refresh: boolean = false) => {
    try {
      const data = await api.getCategories(kind, refresh);
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch categories', err);
      setCategories([]);
    }
  }, []);

  // Fetch items for the selected category
  const fetchItems = useCallback(async (kind: 'movies' | 'series', catId: string, search: string, newOffset: number, append: boolean = false, refresh: boolean = false) => {
    if (!append) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const data = await api.getItems(kind, catId, search, newOffset, LIMIT, refresh);
      if (data && Array.isArray(data.items)) {
        setIsItemsCached(!!data.is_cached);
        if (append) {
          setItems(prev => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setTotalItems(data.total || 0);
        setOffset(data.offset || 0);
      } else {
        setItems([]);
        setTotalItems(0);
      }
    } catch (err) {
      console.error('Failed to fetch items', err);
      if (!append) setError('Failed to communicate with the server. Please check your provider settings.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Search debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(itemSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  // Tab switching logic: refresh categories
  useEffect(() => {
    if (config?.is_complete) {
      fetchCategories(activeTab);
      setSelectedCat('0'); // Reset to "All Categories"
    }
  }, [activeTab, fetchCategories, config?.is_complete]);

  // Category selection or search logic: refresh items
  useEffect(() => {
    if (config?.is_complete && selectedCat !== null) {
      fetchItems(activeTab, selectedCat, debouncedSearch, 0, false);
    }
  }, [selectedCat, activeTab, debouncedSearch, fetchItems, config?.is_complete]);

  const handleLoadMore = () => {
    fetchItems(activeTab, selectedCat, debouncedSearch, offset + LIMIT, true);
  };

  const handleManualRefresh = () => {
    fetchCategories(activeTab, true);
    fetchItems(activeTab, selectedCat, debouncedSearch, 0, false, true);
    setToast({ message: 'Catalog cache cleared', type: 'info' });
  };

  const handleClearAll = async () => {
    setConfirm({
      title: 'Empty Queue',
      message: 'Are you sure you want to empty the entire download queue? This will stop all active downloads.',
      onConfirm: async () => {
        await api.controlQueue('clear-all');
        setConfirm(null);
        setToast({ message: 'Queue emptied', type: 'success' });
      }
    });
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      const updated = await api.updateConfig(config);
      // Ensure we don't carry over the plaintext password in state
      const cleanUpdated = { ...updated };
      delete cleanUpdated.admin_password;
      
      setConfig(cleanUpdated);
      localStorage.setItem('vodarr_config', JSON.stringify(cleanUpdated));
      
      setToast({ message: 'Settings saved successfully', type: 'success' });
      setShowSettings(false);
      if (updated.is_complete) {
        fetchCategories(activeTab);
      }
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to save settings', type: 'error' });
    }
  };

  const handleAddToQueue = async (item: Item) => {
    if (activeTab === 'movies') {
      const streamId = item.stream_id;
      const baseUrl = config?.base_url;
      const user = config?.username;
      const pass = config?.password;
      
      const primaryExt = item.container_extension || 'mp4';
      const fallbacks = ['mkv', 'mp4', 'avi'].filter(ext => ext !== primaryExt);
      
      const rawName = item.name;
      const cleanName = stripExtension(rawName);
      const safeMovieName = sanitiseFilename(cleanName);
      const yearPart = item.year ? ` (${item.year})` : '';
      
      const movieTitle = `${safeMovieName}${yearPart}.${primaryExt}`;
      const streamUrl = `${baseUrl}/movie/${user}/${pass}/${streamId}.${primaryExt}`;
      const targetPath = `${config?.download_dir}/Movies/${movieTitle}`;
      
      const fallbackUrls = fallbacks.map(ext => `${baseUrl}/movie/${user}/${pass}/${streamId}.${ext}`);
      
      await api.addToQueue([{
        item_id: streamId,
        title: movieTitle,
        stream_url: streamUrl,
        target_path: targetPath,
        kind: 'movie',
        meta: {
          fallbacks: fallbackUrls,
          original_extension: primaryExt,
          year: item.year,
          display_year: item.display_year
        }
      }]);
      setToast({ message: `Added ${rawName} to queue`, type: 'success' });
    } else {
      setSelectedSeries(item);
    }
  };

  const totalSpeed = queue.reduce((acc, item) => acc + (item.status === 'downloading' ? item.speed : 0), 0);
  const totalRemainingBytes = queue.reduce((acc, item) => {
    if (item.status === 'completed') return acc;
    const remaining = (item.total_size || 0) - (item.downloaded_bytes || 0);
    return acc + Math.max(0, remaining);
  }, 0);
  const globalETA = totalSpeed > 0 ? totalRemainingBytes / totalSpeed : 0;

  const fetchQueue = useCallback(async () => {
    try {
      const data = await api.getQueue();
      setQueue(Array.isArray(data) ? data : []);
      
      // Also fetch status to keep badges fresh
      const status = await api.getStatus();
      if (config) {
        setConfig({
          ...config,
          is_in_window: status.is_in_window,
          is_stream_limit_reached: status.is_stream_limit_reached
        });
      }
    } catch (err) {
      console.error('Failed to fetch queue', err);
    }
  }, [config]);

  useEffect(() => {
    fetchQueue();
    queuePollRef.current = setInterval(fetchQueue, 2000);
    return () => clearInterval(queuePollRef.current);
  }, [fetchQueue]);

  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'above' | 'below' | null>(null);
  const dragItem = useRef<number | null>(null);

  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragItem.current === null) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const pos = e.clientY < mid ? 'above' : 'below';
    setDragOverIdx(idx);
    setDragOverPos(pos);
  };

  const handleDrop = async () => {
    if (dragItem.current === null || dragOverIdx === null || dragOverPos === null) return;
    const copyListItems = [...queue];
    const dragItemContent = copyListItems[dragItem.current];
    copyListItems.splice(dragItem.current, 1);
    let newIdx = dragOverIdx;
    if (dragOverPos === 'below') {
      if (dragItem.current < dragOverIdx) newIdx = dragOverIdx;
      else newIdx = dragOverIdx + 1;
    } else {
      if (dragItem.current < dragOverIdx) newIdx = dragOverIdx - 1;
      else newIdx = dragOverIdx;
    }
    newIdx = Math.max(0, Math.min(newIdx, copyListItems.length));
    copyListItems.splice(newIdx, 0, dragItemContent);
    dragItem.current = null;
    setDragOverIdx(null);
    setDragOverPos(null);
    setQueue(copyListItems);
    try {
      await api.reorderQueue(copyListItems.map(item => item.queue_id));
    } catch (err) {
      console.error('Failed to save new order', err);
    }
  };

  const handleMoveToTop = async (queueId: string) => {
    const item = queue.find(i => i.queue_id === queueId);
    if (!item) return;
    const newQueue = [item, ...queue.filter(i => i.queue_id !== queueId)];
    setQueue(newQueue);
    try {
      await api.reorderQueue(newQueue.map(i => i.queue_id));
      setToast({ message: 'Item moved to top', type: 'info' });
    } catch (err) {
      console.error('Failed to move item to top', err);
    }
  };

  const filteredCats = Array.isArray(categories) ? categories.filter(c => 
    c.category_name.toLowerCase().includes(catFilter.toLowerCase())
  ) : [];

  const displayItems = Array.isArray(items) ? items : [];

  if (config && !config.is_complete) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
        <SetupWizard
          config={config}
          setConfig={setConfig}
          onSave={handleSaveConfig}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''} flex flex-col h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden text-sm transition-colors duration-200 font-sans tracking-tight text-gray-900 dark:text-gray-100`}>
      {showLogin && authStatus && !authStatus.is_authenticated && config?.is_complete && (
        <LoginModal onLogin={() => {
          setShowLogin(false);
          fetchConfig();
          api.getUAPresets().then(setUAPresets);
        }} />
      )}

      <header className="h-20 bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-6 md:px-10 flex items-center justify-between shadow-sm z-30 flex-shrink-0">
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 md:hidden text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
            <Menu size={24}/>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              <Download size={22} strokeWidth={3} />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter italic">
              Vodarr<span className="text-blue-600">.</span>
            </h1>
            {version && <span className="text-[10px] font-black bg-gray-100 dark:bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full mt-1.5 tabular-nums">v{version}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={handleManualRefresh} className="p-2 md:p-3 bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 rounded-xl md:rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all border dark:border-gray-800">
            <RefreshCw size={20}/>
          </button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 md:p-3 bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 rounded-xl md:rounded-2xl hover:bg-gray-200 transition-all border dark:border-gray-800">
            {isDarkMode ? <Sun size={20}/> : <Moon size={20}/>}
          </button>
          <div className="w-px h-8 md:h-10 bg-gray-200 dark:bg-gray-800 mx-1 md:mx-2"></div>
          <button onClick={() => setShowSettings(true)} className="p-2 md:p-3 bg-blue-600 text-white rounded-xl md:rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/30 border-2 border-transparent hover:border-white/20">
            <Settings size={20}/>
          </button>
        </div>
      </header>

      {toast && <Toast message={toast.message} type={toast.type} onClose={handleCloseToast} />}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      
      {showSettings && (
        <SettingsModal 
          config={config} 
          setConfig={(c) => setConfig(c)}
          onSave={handleSaveConfig}
          onClose={() => setShowSettings(false)}
          uaPresets={uaPresets}
          onTest={() => api.testConnection().then(r => setToast({ message: r.message, type: r.status === 'success' ? 'success' : 'error' }))}
          setToast={setToast}
          version={version}
        />
      )}

      {selectedItem && (
        <ItemDetailsModal
          item={selectedItem}
          kind={activeTab}
          onClose={() => setSelectedItem(null)}
          onQueue={handleAddToQueue}
          setToast={setToast}
        />
      )}

      {selectedSeries && (
        <EpisodeSelectorModal
          series={selectedSeries}
          config={config}
          onClose={() => setSelectedSeries(null)}
          onQueue={(items) => {
            api.addToQueue(items);
            setToast({ message: `Added ${items.length} episodes to queue`, type: 'success' });
          }}
        />
      )}

      <main className="flex flex-1 overflow-hidden relative">
        <aside className={`${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} absolute md:relative w-72 h-full bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col z-40 transition-transform duration-300`}>
          <div className="p-6 border-b dark:border-gray-800 flex flex-col gap-6">
            <div className="flex bg-gray-200/50 dark:bg-gray-800/50 rounded-2xl p-1.5 border dark:border-gray-700">
              <button onClick={() => setActiveTab('movies')} className={`flex-1 py-2.5 rounded-[1.25rem] transition-all ${activeTab === 'movies' ? 'bg-white dark:bg-gray-700 shadow-md text-blue-600' : 'text-gray-500'}`}>Movies</button>
              <button onClick={() => setActiveTab('series')} className={`flex-1 py-2.5 rounded-[1.25rem] transition-all ${activeTab === 'series' ? 'bg-white dark:bg-gray-700 shadow-md text-blue-600' : 'text-gray-500'}`}>Series</button>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-4 top-3.5 text-gray-400" />
              <input placeholder="Filter categories..." className="w-full pl-12 py-3 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 rounded-2xl outline-none" value={catFilter} onChange={e => setCatFilter(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            <button onClick={() => setSelectedCat('0')} className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${selectedCat === '0' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>All Categories</button>
            {filteredCats.map(cat => (
              <button key={cat.category_id} onClick={() => setSelectedCat(cat.category_id)} className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-bold truncate transition-all ${selectedCat === cat.category_id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>{cat.category_name}</button>
            ))}
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
          <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">{activeTab} • {categories.find(c => c.category_id === selectedCat)?.category_name || 'All'}</h2>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{totalItems} items</p>
            </div>
            <div className="flex items-center gap-3 md:gap-6 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
              {/* View Mode Switcher */}
              <div className="flex items-center gap-4 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 border dark:border-gray-700 shadow-inner flex-shrink-0">
                <div className="flex gap-1">
                  <button onClick={() => setViewMode('poster')} className={`p-2 rounded-lg ${viewMode === 'poster' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18}/></button>
                  <button onClick={() => setViewMode('compact')} className={`p-2 rounded-lg ${viewMode === 'compact' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-400'}`}><List size={18}/></button>
                  <button onClick={() => setViewMode('thin')} className={`p-2 rounded-lg ${viewMode === 'thin' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-400'}`}><AlignJustify size={18}/></button>
                </div>
                
                {viewMode !== 'thin' && (
                  <div className="flex items-center gap-3 px-3 border-l dark:border-gray-700 hidden sm:flex">
                    <LayoutGrid size={12} className="text-gray-400" />
                    <input 
                      type="range" min="100" max="300" step="10"
                      className="w-24 accent-blue-600 cursor-pointer"
                      value={posterSize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setPosterSize(val);
                        localStorage.setItem('poster-size', val.toString());
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="relative flex-1 lg:w-80 min-w-[200px]">
                <Search size={18} className="absolute left-4 top-2.5 text-gray-400" />
                <input placeholder="Search..." className="w-full pl-12 py-2 rounded-xl border dark:border-gray-700 dark:bg-gray-800" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                <RefreshCw size={48} className="animate-spin text-blue-600" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {isItemsCached ? 'Restoring from database...' : 'Syncing Library...'}
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-red-500">
                <AlertCircle size={48} />
                <p className="font-bold text-center px-6">{error}</p>
                <button onClick={() => fetchItems(activeTab, selectedCat, debouncedSearch, 0, false, true)} className="px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black uppercase text-[10px] tracking-widest">Retry Sync</button>
              </div>
            ) : (
              <div className="flex flex-col min-h-full pb-96">
                <div className={`p-4 md:p-6 ${viewMode === 'poster' ? 'grid gap-6' : 'flex flex-col space-y-1'}`}
                     style={viewMode === 'poster' ? { gridTemplateColumns: `repeat(auto-fill, minmax(${posterSize}px, 1fr))` } : {}}>
                  {displayItems.map((item, idx) => {
                    if (viewMode === 'poster') {
                      return (
                        <div key={idx} className="group relative flex flex-col animate-in fade-in zoom-in-95 duration-300">
                          <div 
                            onClick={() => setSelectedItem(item)}
                            className="aspect-[2/3] rounded-[1.5rem] overflow-hidden bg-gray-200 dark:bg-gray-800 shadow-lg border-2 border-white dark:border-gray-800 transition-all group-hover:scale-[1.03] group-hover:shadow-blue-500/20 group-hover:border-blue-500/50 cursor-pointer"
                          >
                            <SafeImage 
                              src={item.cover} 
                              className="w-full h-full object-cover" 
                              alt=""
                              fallbackIcon={activeTab === 'movies' ? Film : Tv}
                              iconSize={32}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleAddToQueue(item); }}
                                className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl active:scale-95 flex items-center justify-center gap-2"
                              >
                                {activeTab === 'series' ? <ChevronRight size={16}/> : <Download size={16}/>}
                                {activeTab === 'series' ? 'Episodes' : 'Queue'}
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 px-1">
                            <h3 className="text-xs font-black text-gray-800 dark:text-gray-100 truncate uppercase tracking-tight" title={item.name}>{item.name}</h3>
                            {(item.display_year || item.year) && (
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{item.display_year || item.year}</p>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (viewMode === 'compact') {
                      return (
                        <div 
                          key={idx} 
                          onClick={() => setSelectedItem(item)}
                          className="px-4 py-1.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between group transition-all border border-transparent hover:border-gray-100 dark:hover:border-gray-800 cursor-pointer"
                        >
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 shadow-lg border-2 border-white dark:border-gray-800"
                                 style={{ width: `${posterSize/2.5}px`, height: `${(posterSize/2.5) * 1.5}px` }}>
                              <SafeImage 
                                src={item.cover} 
                                className="w-full h-full object-cover" 
                                alt=""
                                fallbackIcon={activeTab === 'movies' ? Film : Tv}
                                iconSize={16}
                              />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 truncate uppercase tracking-tight" title={item.name}>{item.name}</h3>
                              <div className="flex items-center gap-3 mt-0.5">
                                {(item.display_year || item.year) && <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[9px] font-black text-gray-500 uppercase tracking-tighter">{item.display_year || item.year}</span>}
                                {activeTab === 'series' && <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Series</span>}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleAddToQueue(item); }}
                            className="ml-4 bg-blue-600 text-white p-2 rounded-xl font-bold hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-all active:scale-90 shadow-lg shadow-blue-500/30 flex items-center gap-2"
                          >
                            {activeTab === 'series' ? <ChevronRight size={16}/> : <Download size={16}/>}
                            {activeTab === 'series' && <span className="text-[9px] font-black uppercase tracking-widest px-1">Episodes</span>}
                          </button>
                        </div>
                      );
                    }

                    // Thin List
                    return (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedItem(item)}
                        className="px-4 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between group transition-all border border-transparent hover:border-gray-100 dark:hover:border-gray-800 cursor-pointer"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <span className="text-[10px] font-black text-gray-400 w-8 tabular-nums">{(offset + idx + 1).toString().padStart(2, '0')}</span>
                          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate uppercase tracking-tight" title={item.name}>{item.name}</h3>
                          {(item.display_year || item.year) && <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter opacity-60">({item.display_year || item.year})</span>}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleAddToQueue(item); }}
                          className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 p-1 rounded-md hover:bg-blue-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                        >
                          {activeTab === 'series' ? <ChevronRight size={14}/> : <Download size={14}/>}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center p-12">
                  <button onClick={handleLoadMore} disabled={loadingMore} className="px-10 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 disabled:opacity-50">
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className={`
        ${isQueueMaximized ? 'fixed inset-0 z-[150] h-full' : isQueueMinimized ? 'fixed bottom-0 left-0 right-0 z-50 h-16' : 'fixed bottom-0 left-0 right-0 z-50 h-80'} 
        bg-white dark:bg-gray-900 border-t dark:border-gray-800 flex flex-col shadow-2xl transition-all duration-500 overflow-hidden
      `}>
        <div className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 px-8 py-4 flex items-center justify-between cursor-pointer" onClick={() => isQueueMinimized && setIsQueueMinimized(false)}>
          <div className="flex items-center gap-8">
            <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3"><Download size={20} className="text-blue-600"/> Queue</h3>
            <div className="flex gap-4">
              <span className="text-[10px] font-black uppercase text-blue-600">Total: {queue.length}</span>
              <span className="text-[10px] font-black uppercase text-amber-600">{queue.filter(i => i.status !== 'completed').length} Left</span>
              <span className="text-[10px] font-black uppercase text-green-600">{formatSpeed(totalSpeed)}</span>
              {totalSpeed > 0 && <span className="text-[10px] font-black uppercase text-gray-400">{formatETA(globalETA)}</span>}
              
              {config?.enable_download_window && !config.is_in_window && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full animate-pulse shadow-sm">
                  <Clock size={10} />
                  <span className="text-[8px] font-black uppercase tracking-tighter">Window Closed</span>
                </div>
              )}

              {config?.check_stream_limit && config.is_stream_limit_reached && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full animate-pulse shadow-sm">
                  <AlertTriangle size={10} />
                  <span className="text-[8px] font-black uppercase tracking-tighter">Max Streams Reached</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => api.controlQueue('start').then(() => fetchQueue())} className="p-2.5 bg-green-600 text-white rounded-xl" title="Start All"><Play size={16}/></button>
            <button onClick={() => api.controlQueue('pause').then(() => fetchQueue())} className="p-2.5 bg-amber-500 text-white rounded-xl" title="Pause All"><Pause size={16}/></button>
            <button onClick={() => api.controlQueue('restart-failed').then(() => fetchQueue())} className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all" title="Requeue All Failed"><RefreshCw size={16}/></button>
            <button onClick={() => api.controlQueue('clear-completed').then(() => fetchQueue())} className="p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl" title="Clear Completed"><Check size={16}/></button>
            <button onClick={handleClearAll} className="p-2.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-600 hover:text-white transition-all" title="Wipe Queue"><Trash2 size={16}/></button>
            
            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />

            <button onClick={() => setIsQueueMinimized(!isQueueMinimized)} className={`p-2.5 rounded-xl transition-all ${isQueueMinimized ? 'bg-blue-600 text-white animate-pulse' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`} title={isQueueMinimized ? "Restore" : "Minimize"}>
              {isQueueMinimized ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
            </button>
            <button onClick={toggleQueue} className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl hover:bg-gray-200" title={isQueueMaximized ? "Normalize" : "Maximize"}>
              {isQueueMaximized ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 uppercase text-[10px] font-black tracking-widest text-gray-400">
              <tr>
                <th className="w-12"></th>
                <th className="p-4">Title</th>
                <th className="p-4 w-32">Status</th>
                <th className="p-4 w-48">Progress</th>
                <th className="p-4 w-20">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {queue.map((item, idx) => (
                <tr 
                  key={item.queue_id} 
                  draggable 
                  onDragStart={() => handleDragStart(idx)} 
                  onDragOver={(e) => handleDragOver(e, idx)} 
                  onDrop={handleDrop} 
                  className={`group hover:bg-gray-50 dark:hover:bg-gray-800/30 ${dragItem.current === idx ? 'opacity-40' : ''}`}
                >
                  <td className="pl-6 text-gray-300 cursor-grab active:cursor-grabbing"><GripVertical size={16}/></td>
                  <td className="p-4 font-bold text-xs truncate max-w-xs" title={item.title}>{item.title}</td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-fit px-2 py-0.5 rounded-full text-[7px] md:text-[8px] font-black uppercase tracking-widest shadow-sm ${
                          item.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          item.status === 'downloading' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          item.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {item.status === 'queued' && queue.some(i => i.status === 'downloading') ? 'Waiting' : item.status}
                        </span>
                        
                        {item.retries > 0 && item.status !== 'completed' && (
                          <span className="text-[7px] md:text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/50">
                            Attempt {item.retries + 1} {config?.max_retries ? `/ ${config.max_retries + 1}` : ''}
                          </span>
                        )}
                      </div>
                      
                      {item.status === 'downloading' && (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-[8px] md:text-[10px] font-bold text-blue-600 dark:text-blue-400 tabular-nums">{formatSpeed(item.speed)}</span>
                        </div>
                      )}
                      
                      {item.error && item.status !== 'completed' && (
                        <p className="text-[7px] md:text-[8px] font-bold text-red-500/80 dark:text-red-400/80 truncate max-w-[100px] md:max-w-[200px]" title={item.error}>
                          {item.error}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${item.status === 'completed' ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${item.progress * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-black tabular-nums">{Math.round(item.progress * 100)}%</span>
                      </div>
                      {item.total_size > 0 && (
                        <p className="text-[8px] md:text-[9px] font-bold text-gray-400 dark:text-gray-500 tabular-nums text-right px-1">
                          {formatSize(item.downloaded_bytes)} / {formatSize(item.total_size)}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); api.restartItem(item.queue_id, true).then(() => fetchQueue()); setToast({ message: 'Forcing item to start...', type: 'info' }); }} 
                        className={`p-1.5 rounded-lg transition-all ${item.status === 'completed' || item.status === 'downloading' ? 'opacity-20 pointer-events-none' : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30'}`}
                        title="Start Now (Preempt Current)"
                      >
                        <Zap size={14} fill="currentColor"/>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleMoveToTop(item.queue_id); }} 
                        className={`p-1.5 rounded-lg transition-all ${idx === 0 || item.status === 'completed' ? 'opacity-20 pointer-events-none' : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30'}`}
                        title="Move to Top"
                      >
                        <MoveUp size={14}/>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); api.restartItem(item.queue_id).then(() => fetchQueue()); }} 
                        className={`p-1.5 rounded-lg transition-all ${item.status === 'completed' ? 'opacity-20 pointer-events-none' : 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`}
                        title="Retry Item"
                      >
                        <RefreshCw size={14}/>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); api.removeFromQueue(item.queue_id).then(() => fetchQueue()); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-all" title="Remove Item">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </footer>
    </div>
  );
}
