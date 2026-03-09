import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Download, Pause, Play, Square, Trash2, RefreshCw, Search, X, 
  Settings, Server, Folder, 
  ChevronRight, Film, Tv, CheckCircle2, AlertCircle,
  Sun, Moon, Clock, Save, ChevronDown, Info,
  ShieldCheck, HardDrive, Zap, Globe, AlertTriangle, Check,
  LayoutGrid, List, AlignJustify, Power, Star, Calendar, Menu, ChevronUp, PlayCircle
} from 'lucide-react';

/**
 * IPTV VOD Downloader - Main Application Component
 */

// --- TypeScript Interfaces ---

interface Config {
  base_url: string;
  username: string;
  password: string;
  download_dir: string;
  user_agent: string;
  web_port: number;
  cache_expiry_hours: number;
  auto_retry_failed: boolean;
  max_retries: number;
  retry_forever: boolean;
  retry_start_hour: number;
  retry_end_hour: number;
  is_complete: boolean;
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
  container_extension?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
  duration?: string;
  duration_secs?: number;
  tmdb_id?: string;
  rating_5based?: number;
}

interface Episode {
  id: string;
  episode_num: number | string;
  season: number | string;
  title?: string;
  name?: string;
  container_extension: string;
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
  retries: number;
  error?: string;
}

type ViewMode = 'poster' | 'compact' | 'thin';

// --- API Client Helpers ---

const api = {
  getConfig: () => fetch('/api/config').then(r => r.json()),
  updateConfig: (config: Partial<Config>) => fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  }).then(r => r.json()),
  getUAPresets: () => fetch('/api/common-user-agents').then(r => r.json()),
  testConnection: () => fetch('/api/test-connection').then(r => r.json()),
  getAccountInfo: () => fetch('/api/account').then(r => r.json()),
  getCategories: (kind: 'movies' | 'series', refresh: boolean = false) => fetch(`/api/categories/${kind}${refresh ? '?refresh=true' : ''}`).then(r => r.json()),
  getItems: (kind: 'movies' | 'series', catId: string, search?: string, offset: number = 0, limit: number = 50, refresh: boolean = false) => {
    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
    });
    if (search) params.append('search', search);
    if (refresh) params.append('refresh', 'true');
    return fetch(`/api/items/${kind}/${catId}?${params.toString()}`).then(r => r.json());
  },
  getSeriesInfo: (seriesId: string) => fetch(`/api/series/${seriesId}`).then(r => r.json()),
  getMovieInfo: (streamId: string) => fetch(`/api/movie/${streamId}`).then(r => r.json()),
  browseFolders: (path?: string) => fetch(`/api/browse-folders?path=${encodeURIComponent(path || '')}`).then(r => r.json()),
  getQueue: () => fetch('/api/queue').then(r => r.json()),
  addToQueue: (items: any[]) => fetch('/api/queue/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  }).then(r => r.json()),
  controlQueue: (action: string) => fetch(`/api/queue/control/${action}`, { method: 'POST' }).then(r => r.json()),
  removeFromQueue: (queueId: string) => fetch(`/api/queue/${queueId}`, { method: 'DELETE' }).then(r => r.json()),
  restartItem: (queueId: string) => fetch(`/api/queue/restart/${queueId}`, { method: 'POST' }).then(r => r.json()),
  restartSystem: () => fetch('/api/system/restart', { method: 'POST' }).then(r => r.json()),
  shutdownSystem: () => fetch('/api/system/shutdown', { method: 'POST' }).then(r => r.json()),
};

// --- Safe Image Component ---

function SafeImage({ 
  src, 
  alt, 
  className, 
  fallbackIcon: FallbackIcon, 
  iconSize = 24 
}: { 
  src?: string, 
  alt?: string, 
  className?: string, 
  fallbackIcon: any, 
  iconSize?: number 
}) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 border-2 border-red-500/20 ${className}`}>
        <div className="relative flex items-center justify-center">
          <FallbackIcon size={iconSize} strokeWidth={1} className="text-gray-300 dark:text-gray-700 opacity-20" />
          <X size={iconSize * 1.2} strokeWidth={4} className="absolute text-red-600/60 rotate-12" />
        </div>
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt={alt} 
      className={className} 
      loading="lazy" 
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
    />
  );
}

// --- Custom UI Components ---

function Toast({ message, type, onClose }: { message: string, type: 'success' | 'error' | 'info', onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 1000);
    return () => clearTimeout(timer);
  }, [onClose, message]);

  if (!message) return null;

  const icons = {
    success: <CheckCircle2 className="text-green-500" />,
    error: <AlertCircle className="text-red-500" />,
    info: <Info className="text-blue-500" />
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-2xl border dark:border-gray-700 px-6 py-4 flex items-center gap-4 min-w-[300px]">
        {icons[type]}
        <span className="font-bold text-gray-800 dark:text-gray-100">{message}</span>
      </div>
    </div>
  );
}

function ConfirmDialog({ 
  title, 
  message, 
  onConfirm, 
  onCancel 
}: { 
  title: string, 
  message: string, 
  onConfirm: () => void, 
  onCancel: () => void 
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-red-500/20 relative">
        <button 
          onClick={onCancel} 
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors active:scale-90"
        >
          <X size={20} />
        </button>
        <div className="p-8 text-center space-y-4">
          <div className="bg-red-100 dark:bg-red-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="text-red-600 dark:text-red-400" size={32} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{title}</h2>
          <p className="text-gray-500 dark:text-gray-400 font-medium">{message}</p>
        </div>
        <div className="flex border-t dark:border-gray-800">
          <button onClick={onCancel} className="flex-1 px-6 py-5 font-black uppercase tracking-widest text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Dismiss</button>
          <button onClick={onConfirm} className="flex-1 px-6 py-5 font-black uppercase tracking-widest text-xs bg-red-600 text-white hover:bg-red-700 transition-colors shadow-inner">Confirm</button>
        </div>
      </div>
    </div>
  );
}

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

const formatETA = (seconds: number) => {
  if (seconds <= 0 || !isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
};

const sanitiseFilename = (name: string): string => {
  if (!name) return '';
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
};

// --- Folder Selector Modal ---

function FolderSelectorModal({ 
  currentPath, 
  onClose, 
  onSelect 
}: { 
  currentPath: string, 
  onClose: () => void, 
  onSelect: (path: string) => void 
}) {
  const [folders, setFolders] = useState<any[]>([]);
  const [path, setPath] = useState(currentPath);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFolders = async () => {
      setLoading(true);
      try {
        const data = await api.browseFolders(path);
        setFolders(data.folders);
        setPath(data.current_path);
      } catch (err) {
        console.error('Failed to browse folders', err);
      } finally {
        setLoading(false);
      }
    };
    loadFolders();
  }, [path]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[300] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border dark:border-gray-800 flex flex-col h-[500px] animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/40">
          <div className="flex items-center gap-4">
            <div className="bg-amber-500 p-2.5 rounded-xl">
              <Folder className="text-white" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black dark:text-white uppercase tracking-tight">Browse Folders</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 truncate max-w-[300px]">{path}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-xl transition-all active:scale-90">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
              <RefreshCw className="animate-spin" size={32} />
              <span className="text-[10px] font-black uppercase tracking-widest">Scanning Disk...</span>
            </div>
          ) : (
            folders.map((folder, idx) => (
              <button
                key={idx}
                onClick={() => setPath(folder.path)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all group ${folder.is_parent ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <div className={`p-2 rounded-lg ${folder.is_parent ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 group-hover:bg-amber-100 group-hover:text-amber-600'}`}>
                  {folder.is_parent ? <ChevronRight size={16} className="rotate-180" /> : <Folder size={16} />}
                </div>
                <span className={`font-bold text-sm ${folder.is_parent ? 'text-blue-600' : 'text-gray-700 dark:text-gray-200'} truncate`}>
                  {folder.name}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="p-6 border-t dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-700">Cancel</button>
          <button 
            onClick={() => { onSelect(path); onClose(); }} 
            className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center gap-2"
          >
            <Check size={16} strokeWidth={3}/> Select This Folder
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Setup Wizard Component ---

function SetupWizard({ 
  config, 
  setConfig, 
  onSave
}: { 
  config: Config | null, 
  setConfig: (c: Config) => void, 
  onSave: () => void
}) {
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  if (!config) return null;

  return (
    <div className="fixed inset-0 bg-gray-100 dark:bg-gray-950 z-[200] flex items-center justify-center p-4">
      {showFolderPicker && (
        <FolderSelectorModal 
          currentPath={config.download_dir}
          onClose={() => setShowFolderPicker(false)}
          onSelect={(p) => setConfig({...config, download_dir: p})}
        />
      )}
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden border dark:border-gray-800 animate-in fade-in zoom-in-95 duration-500">
        <div className="p-12 space-y-10">
          <div className="text-center space-y-4">
            <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-blue-500/40 rotate-3">
              <Zap className="text-white" size={40} strokeWidth={2.5}/>
            </div>
            <div className="space-y-1">
              <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Welcome to Vodarr</h2>
              <p className="text-gray-500 font-medium">To get started, please connect your Xtream API provider.</p>
            </div>
          </div>

          <div className="grid gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Server URL</label>
              <div className="relative group">
                <Globe className="absolute left-5 top-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20}/>
                <input 
                  className="w-full border-none rounded-2xl px-14 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-lg"
                  placeholder="http://your-provider.com:8080"
                  value={config.base_url} 
                  onChange={e => setConfig({...config, base_url: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Username</label>
                <input 
                  className="w-full border-none rounded-2xl px-6 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-lg"
                  placeholder="user123"
                  value={config.username} 
                  onChange={e => setConfig({...config, username: e.target.value})}
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Password</label>
                <input 
                  type="password"
                  className="w-full border-none rounded-2xl px-6 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-lg"
                  placeholder="••••••••"
                  value={config.password} 
                  onChange={e => setConfig({...config, password: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Download Directory</label>
              <div className="flex gap-3">
                <div className="relative group flex-1">
                  <Folder className="absolute left-5 top-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20}/>
                  <input 
                    className="w-full border-none rounded-2xl px-14 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold"
                    value={config.download_dir} 
                    onChange={e => setConfig({...config, download_dir: e.target.value})}
                  />
                </div>
                <button 
                  onClick={() => setShowFolderPicker(true)}
                  className="px-6 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 border-2 border-transparent hover:border-blue-500/20"
                >
                  <Folder size={20}/>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button 
              onClick={onSave}
              disabled={!config.base_url || !config.username || !config.password}
              className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black uppercase tracking-widest shadow-2xl shadow-blue-500/40 hover:bg-blue-700 transition-all active:scale-95 disabled:grayscale disabled:opacity-50 flex items-center justify-center gap-4 text-sm"
            >
              Start Downloading VODs <ChevronRight size={20}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Settings Modal Component ---

function SettingsModal({ 
  config, 
  setConfig, 
  onSave, 
  onClose, 
  uaPresets, 
  onTest 
}: { 
  config: Config | null, 
  setConfig: (c: Config) => void, 
  onSave: () => void, 
  onClose: () => void,
  uaPresets: Record<string, string>,
  onTest: () => void
}) {
  const [activeGroup, setActiveGroup] = useState<'server' | 'downloads' | 'automation' | 'system'>('server');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [accountInfo, setAccountInfo] = useState<any>(null);

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const data = await api.getAccountInfo();
        setAccountInfo(data);
      } catch (err) {
        console.error('Failed to fetch account info', err);
      }
    };
    fetchAccount();
  }, []);

  if (!config) return null;

  const groups = [
    { id: 'server', label: 'Server & API', icon: <Server size={18} /> },
    { id: 'downloads', label: 'Downloads', icon: <HardDrive size={18} /> },
    { id: 'automation', label: 'Retry & Automation', icon: <Zap size={18} /> },
    { id: 'system', label: 'System', icon: <Power size={18} /> },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      {showFolderPicker && (
        <FolderSelectorModal 
          currentPath={config.download_dir}
          onClose={() => setShowFolderPicker(false)}
          onSelect={(p) => setConfig({...config, download_dir: p})}
        />
      )}
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden border dark:border-gray-800 flex flex-col md:flex-row h-[600px]">
        {/* Settings Sidebar */}
        <div className="w-full md:w-64 bg-gray-50 dark:bg-gray-950 border-r dark:border-gray-800 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-10 pl-2">
              <div className="bg-blue-600 p-2 rounded-xl">
                <Settings className="text-white" size={20} />
              </div>
              <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter leading-none">Settings</h2>
            </div>
            
            <nav className="space-y-2">
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => setActiveGroup(group.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${activeGroup === group.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                >
                  {group.icon} {group.label}
                </button>
              ))}
            </nav>
          </div>

          <button 
            onClick={onTest} 
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-900 border dark:border-gray-800 text-blue-600 dark:text-blue-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all active:scale-95 shadow-sm"
          >
            <ShieldCheck size={14}/> Test Connection
          </button>
        </div>
        
        {/* Settings Content */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden relative">
          <button 
            onClick={onClose}
            className="absolute top-8 right-8 p-3 bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-2xl transition-all hidden md:flex active:scale-90 z-10"
          >
            <X size={24} />
          </button>

          <div className="flex-1 p-10 overflow-y-auto space-y-8">
            {activeGroup === 'server' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white">Server Credentials</h3>
                  <p className="text-sm text-gray-500">Configure your Xtream Codes API connection.</p>
                </div>
                
                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Provider Endpoint</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                      <input 
                        className="w-full border-none rounded-2xl px-12 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        placeholder="http://example.com:8080"
                        value={config.base_url} 
                        onChange={e => setConfig({...config, base_url: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Username</label>
                      <input 
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.username} 
                        onChange={e => setConfig({...config, username: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Password</label>
                      <input 
                        type="password"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.password} 
                        onChange={e => setConfig({...config, password: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {accountInfo?.user_info && (
                  <div className="pt-6 border-t dark:border-gray-800 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Account Vital Stats</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border dark:border-gray-800">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Expiration</p>
                        <p className="text-sm font-bold dark:text-gray-200 mt-1">
                          {accountInfo.user_info.exp_date ? new Date(parseInt(accountInfo.user_info.exp_date) * 1000).toLocaleDateString() : 'Unlimited'}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border dark:border-gray-800">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Active Streams</p>
                        <p className="text-sm font-bold mt-1 flex items-center gap-2">
                          <span className={parseInt(accountInfo.user_info.active_cons) >= parseInt(accountInfo.user_info.max_connections) ? 'text-red-500' : 'text-green-500'}>
                            {accountInfo.user_info.active_cons}
                          </span>
                          <span className="text-gray-400">/ {accountInfo.user_info.max_connections}</span>
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border dark:border-gray-800 col-span-2">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Allowed Formats</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(accountInfo.user_info.allowed_output_formats || ['mkv', 'mp4', 'ts']).map((fmt: string) => (
                            <span key={fmt} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-tighter">
                              {fmt}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeGroup === 'downloads' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white">Storage & Identity</h3>
                  <p className="text-sm text-gray-500">How and where your files are saved.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Download Directory</label>
                    <div className="flex gap-3">
                      <div className="relative group flex-1">
                        <Folder className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                        <input 
                          className="w-full border-none rounded-2xl px-12 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                          value={config.download_dir} 
                          onChange={e => setConfig({...config, download_dir: e.target.value})}
                        />
                      </div>
                      <button 
                        onClick={() => setShowFolderPicker(true)}
                        className="px-5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all border dark:border-gray-800"
                      >
                        <Folder size={18}/>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">VOD Auto-Refresh (H)</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.cache_expiry_hours} 
                        onChange={e => setConfig({...config, cache_expiry_hours: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">User-Agent Profile</label>
                      <select 
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium appearance-none"
                        value={Object.values(uaPresets).includes(config.user_agent) ? config.user_agent : 'custom'}
                        onChange={e => {
                          if (e.target.value !== 'custom') setConfig({...config, user_agent: e.target.value});
                        }}
                      >
                        {Object.entries(uaPresets).map(([label, val]) => (
                          <option key={label} value={val}>{label}</option>
                        ))}
                        <option value="custom">Custom Identity...</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeGroup === 'automation' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white">Retry Logic</h3>
                  <p className="text-sm text-gray-500">Automate recovery from connection failures.</p>
                </div>

                <div className="space-y-6">
                  <div 
                    onClick={() => setConfig({...config, auto_retry_failed: !config.auto_retry_failed})}
                    className={`flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all cursor-pointer ${config.auto_retry_failed ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-800'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${config.auto_retry_failed ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                        <Zap size={24}/>
                      </div>
                      <div>
                        <p className="font-black dark:text-white uppercase tracking-tight">Auto-Retry Failed Items</p>
                        <p className="text-xs text-gray-500">Automatically re-queues failed downloads.</p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${config.auto_retry_failed ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}>
                      {config.auto_retry_failed && <Check size={14} className="text-white" strokeWidth={4}/>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pl-2">
                    <div 
                      onClick={() => config.auto_retry_failed && setConfig({...config, retry_forever: !config.retry_forever})}
                      className={`flex items-center gap-3 cursor-pointer ${!config.auto_retry_failed && 'opacity-30'}`}
                    >
                      <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors ${config.retry_forever ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}>
                        {config.retry_forever && <Check size={12} className="text-white" strokeWidth={4}/>}
                      </div>
                      <span className="text-sm font-bold dark:text-gray-200">Retry Forever (No Limit)</span>
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Manual Retry Limit</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-30"
                        disabled={!config.auto_retry_failed || config.retry_forever}
                        value={config.max_retries} 
                        onChange={e => setConfig({...config, max_retries: parseInt(e.target.value) || 0})}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t dark:border-gray-800">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                      <Clock size={12}/> Download Window (Allowed Hours)
                    </label>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase pl-1">Start Time</span>
                        <div className="relative">
                           <select
                             className="w-full appearance-none border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-sm cursor-pointer"
                             value={config.retry_start_hour}
                             onChange={e => setConfig({...config, retry_start_hour: parseInt(e.target.value) || 0})}
                           >
                             {Array.from({length: 25}, (_, i) => (
                               <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                             ))}
                           </select>
                           <ChevronDown size={16} className="absolute right-4 top-4 text-gray-400 pointer-events-none"/>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase pl-1">End Time</span>
                        <div className="relative">
                           <select
                             className="w-full appearance-none border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-sm cursor-pointer"
                             value={config.retry_end_hour}
                             onChange={e => setConfig({...config, retry_end_hour: parseInt(e.target.value) || 0})}
                           >
                             {Array.from({length: 25}, (_, i) => (
                               <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                             ))}
                           </select>
                           <ChevronDown size={16} className="absolute right-4 top-4 text-gray-400 pointer-events-none"/>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium italic pl-1">
                      Downloads will only be active between these hours. Set 00:00 to 24:00 for no restriction.
                    </p>
                  </div>                </div>
              </div>
            )}

            {activeGroup === 'system' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">System Maintenance</h3>
                  <p className="text-sm text-gray-500">Manage the application lifecycle and process.</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="p-6 bg-gray-50 dark:bg-gray-800/40 rounded-[2rem] border dark:border-gray-800 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                        <RefreshCw size={24} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Restart Application</h4>
                        <p className="text-xs text-gray-500">Exits the process. In Docker/K8s, the container will restart automatically.</p>
                      </div>
                      <button 
                        onClick={() => api.restartSystem()}
                        className="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-700 transition-all active:scale-95"
                      >
                        Restart
                      </button>
                    </div>
                  </div>

                  <div className="p-6 bg-red-50 dark:bg-red-900/10 rounded-[2rem] border border-red-100 dark:border-red-900/20 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600">
                        <Power size={24} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black dark:text-white uppercase tracking-tight text-sm text-red-600">Shut Down</h4>
                        <p className="text-xs text-gray-500">Stops the application process immediately.</p>
                      </div>
                      <button 
                        onClick={() => api.shutdownSystem()}
                        className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-500/20"
                      >
                        Shutdown
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-10 border-t dark:border-gray-800 flex justify-end gap-4 bg-gray-50/50 dark:bg-gray-950/50">
            <button 
              onClick={onClose} 
              className="px-8 py-3.5 text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest text-[10px] hover:text-gray-700 dark:hover:text-gray-200 transition-all"
            >
              Dismiss
            </button>
            <button 
              onClick={onSave} 
              className="px-12 py-3.5 bg-blue-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/30 active:scale-95 flex items-center gap-3"
            >
              <Save size={18}/> Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Item Details Modal ---

function ItemDetailsModal({ 
  item, 
  kind, 
  onClose, 
  onQueue 
}: { 
  item: Item, 
  kind: 'movies' | 'series', 
  onClose: () => void,
  onQueue: (item: Item) => void
}) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPlayer, setShowPlayer] = useState(false);

  useEffect(() => {
    const loadDetails = async () => {
      try {
        if (kind === 'movies') {
          const data = await api.getMovieInfo(item.stream_id?.toString() || '');
          setDetails(data.info);
        } else {
          const data = await api.getSeriesInfo(item.series_id?.toString() || '');
          setDetails(data.info);
        }
      } catch (err) {
        console.error('Failed to load item details', err);
      } finally {
        setLoading(false);
      }
    };
    loadDetails();
  }, [item, kind]);

  const info = details || item;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[250] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] shadow-2xl w-full max-w-5xl overflow-hidden border dark:border-gray-800 flex flex-col md:flex-row max-h-[90vh] animate-in zoom-in-95 duration-300">
        
        {/* Backdrop / Poster Area */}
        <div className="relative w-full md:w-[400px] h-64 md:h-auto bg-gray-200 dark:bg-gray-800 flex-shrink-0">
          {showPlayer ? (
            <div className="w-full h-full bg-black flex items-center justify-center relative">
              <video 
                src={item.stream_id ? `/api/movie/${item.stream_id}` : ''} 
                controls 
                autoPlay 
                className="w-full h-full object-contain"
              />
              <button 
                onClick={() => setShowPlayer(false)}
                className="absolute top-4 left-4 p-2 bg-black/40 text-white rounded-lg hover:bg-black/60 transition-all"
              >
                <X size={16}/>
              </button>
            </div>
          ) : (
            <>
              <SafeImage 
                src={item.cover} 
                className="w-full h-full object-cover" 
                alt={item.name}
                fallbackIcon={kind === 'movies' ? Film : Tv}
                iconSize={48}
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => setShowPlayer(true)}
                  className="bg-white/20 backdrop-blur-md p-6 rounded-full text-white hover:scale-110 transition-all shadow-2xl"
                >
                  <PlayCircle size={64} fill="currentColor" className="text-white" />
                </button>
              </div>
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent md:hidden pointer-events-none" />
          <button 
            onClick={onClose}
            className="absolute top-6 left-6 p-3 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white rounded-2xl transition-all md:hidden"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <button 
            onClick={onClose}
            className="absolute top-8 right-8 p-3 bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-2xl transition-all hidden md:flex active:scale-90"
          >
            <X size={24} />
          </button>

          <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  {kind === 'movies' ? 'Movie' : 'Series'}
                </span>
                {info.genre && (
                  <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                    {info.genre.split(',')[0]}
                  </span>
                )}
                {info.rating && (
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star size={14} fill="currentColor" />
                    <span className="text-xs font-black">{info.rating}</span>
                  </div>
                )}
              </div>
              
              <h2 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">
                {item.name}
              </h2>
              
              <div className="flex items-center gap-6 text-gray-500 dark:text-gray-400 font-bold text-sm">
                <div className="flex items-center gap-2">
                  <Clock size={16} />
                  <span>
                    {info.duration_secs ? `${Math.floor(info.duration_secs / 60)}m` : (info.duration || info.last_modified || 'N/A')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} />
                  <span>{info.releaseDate || item.year || item.display_year || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Storyline</h3>
              <p className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                {loading ? 'Fetching content details...' : (info.plot || 'No description available for this title.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              {info.cast && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Cast</h3>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{info.cast}</p>
                </div>
              )}
              {info.director && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Director</h3>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{info.director}</p>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-8 md:p-12 bg-gray-50 dark:bg-gray-950/50 border-t dark:border-gray-800 flex items-center justify-between">
            <div className="hidden sm:block">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ready to download</p>
              <p className="text-xs font-bold dark:text-gray-300 mt-1">High Quality Stream</p>
            </div>
            <button 
              onClick={() => { onQueue(item); onClose(); }}
              className="flex-1 sm:flex-none px-12 py-5 bg-blue-600 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95 flex items-center justify-center gap-4"
            >
              {kind === 'series' ? 'Select Episodes' : 'Add to Queue'} <Download size={20} strokeWidth={3}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Episode Selector Modal Component ---

function EpisodeSelectorModal({
  series,
  config,
  onClose,
  onQueue
}: {
  series: Item,
  config: Config | null,
  onClose: () => void,
  onQueue: (items: any[]) => void
}) {
  const [loading, setLoading] = useState(true);
  const [seriesInfo, setSeriesInfo] = useState<any>(null);
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set());
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  const [epSearch, setEpSearch] = useState('');

  useEffect(() => {
    const loadInfo = async () => {
      try {
        const data = await api.getSeriesInfo(series.series_id?.toString() || '');
        setSeriesInfo(data);
        const firstSeason = data.seasons?.[0]?.season_number?.toString();
        if (firstSeason) {
          setExpandedSeasons(new Set([firstSeason]));
        }
      } catch (err) {
        console.error('Failed to load series info', err);
      } finally {
        setLoading(false);
      }
    };
    loadInfo();
  }, [series.series_id]);

  const episodesBySeason = useMemo(() => {
    if (!seriesInfo?.episodes) return {};
    const result: Record<string, Episode[]> = {};
    
    Object.keys(seriesInfo.episodes).forEach(seasonKey => {
      const episodes = seriesInfo.episodes[seasonKey] || [];
      if (!epSearch) {
        result[seasonKey] = episodes;
      } else {
        const term = epSearch.toLowerCase();
        const filtered = episodes.filter((e: any) => 
          (e.title || e.name || '').toLowerCase().includes(term) || 
          `e${e.episode_num}`.toLowerCase().includes(term)
        );
        if (filtered.length > 0) result[seasonKey] = filtered;
      }
    });
    return result;
  }, [seriesInfo, epSearch]);

  const sortedSeasonKeys = useMemo(() => {
    return Object.keys(episodesBySeason).sort((a, b) => parseInt(a) - parseInt(b));
  }, [episodesBySeason]);

  const toggleEpisode = (id: string) => {
    const next = new Set(selectedEpisodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEpisodes(next);
  };

  const toggleSeason = (episodes: Episode[]) => {
    const next = new Set(selectedEpisodes);
    const seasonEpIds = episodes.map(e => e.id);
    const allSelected = seasonEpIds.every(id => next.has(id));
    
    if (allSelected) {
      seasonEpIds.forEach(id => next.delete(id));
    } else {
      seasonEpIds.forEach(id => next.add(id));
    }
    setSelectedEpisodes(next);
  };

  const toggleExpand = (key: string) => {
    const next = new Set(expandedSeasons);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSeasons(next);
  };

  const handleQueueSelected = () => {
    if (!seriesInfo || !config) return;
    const toQueue: any[] = [];
    
    const rawSeriesName = seriesInfo.info?.name || series.name;
    const safeSeriesName = sanitiseFilename(rawSeriesName);
    const seriesYear = seriesInfo.info?.year || series.year;
    const yearPart = seriesYear ? ` (${seriesYear})` : '';
    const seriesFolderName = `${safeSeriesName}${yearPart}`;

    Object.keys(seriesInfo.episodes).forEach(seasonKey => {
      const episodes = seriesInfo.episodes[seasonKey] || [];
      episodes.forEach((ep: any) => {
        if (selectedEpisodes.has(ep.id)) {
          const streamId = ep.id;
          const ext = ep.container_extension || 'mkv';
          const sNum = parseInt(seasonKey).toString().padStart(2, '0');
          const eNum = parseInt(ep.episode_num).toString().padStart(2, '0');
          
          const rawEpTitle = ep.title || ep.name || `Episode ${eNum}`;
          const safeEpTitle = sanitiseFilename(rawEpTitle);
          
          // FILENAME ON DISK: Series (Year) - SXXEYY - Title.ext
          const filename = `${seriesFolderName} - S${sNum}E${eNum} - ${safeEpTitle}.${ext}`;
          
          const streamUrl = `${config.base_url}/series/${config.username}/${config.password}/${streamId}.${ext}`;
          const targetPath = `${config.download_dir}/${seriesFolderName}/Season ${sNum}/${filename}`;

          toQueue.push({
            item_id: streamId,
            title: filename,
            stream_url: streamUrl,
            target_path: targetPath,
            kind: 'episode',
            meta: { original_extension: ext }
          });
        }
      });
    });

    onQueue(toQueue);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden border dark:border-gray-800 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-8 border-b dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-6">
            <div className="w-16 h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl overflow-hidden shadow-xl border-2 border-white dark:border-gray-700 flex-shrink-0">
              <SafeImage 
                src={series.cover} 
                className="w-full h-full object-cover" 
                alt=""
                fallbackIcon={Tv}
                iconSize={32}
              />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">{series.name}</h2>
              <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mt-2">Episode Selection</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-2xl transition-all active:scale-90">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 bg-gray-100 dark:bg-gray-950 border-b dark:border-gray-800 flex items-center gap-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-5 top-3.5 text-gray-400" />
            <input 
              placeholder="Search episodes by name or E01..."
              className="w-full pl-14 pr-6 py-3.5 rounded-2xl border-none bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
              value={epSearch}
              onChange={e => setEpSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
              <RefreshCw size={64} className="animate-spin text-blue-600" strokeWidth={3} />
              <p className="text-gray-500 font-black uppercase tracking-[0.2em] text-[10px]">Parsing Season Tree...</p>
            </div>
          ) : (
            <>
              {sortedSeasonKeys.map(seasonKey => {
                const episodes = episodesBySeason[seasonKey];
                const isExpanded = expandedSeasons.has(seasonKey);
                return (
                  <div key={seasonKey} className="border dark:border-gray-800 rounded-[2rem] overflow-hidden shadow-sm bg-white dark:bg-gray-900">
                    <div 
                      className="flex items-center justify-between p-6 bg-gray-50 dark:bg-gray-800/40 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors"
                      onClick={() => toggleExpand(seasonKey)}
                    >
                      <div className="flex items-center gap-5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors ${isExpanded ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                          {seasonKey}
                        </div>
                        <div>
                          <h3 className="text-lg font-black dark:text-white uppercase tracking-tight">Season {seasonKey}</h3>
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{episodes.length} Episodes available</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleSeason(episodes); }}
                          className="px-4 py-2 rounded-xl bg-white dark:bg-gray-700 border dark:border-gray-600 text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all shadow-sm"
                        >
                          {episodes.every(ep => selectedEpisodes.has(ep.id)) ? 'Deselect All' : 'Select Season'}
                        </button>
                        <ChevronDown size={24} className={`text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white dark:bg-gray-900 border-t dark:border-gray-800 animate-in fade-in slide-in-from-top-4 duration-300">
                        {episodes.map(ep => (
                          <div 
                            key={ep.id} 
                            onClick={() => toggleEpisode(ep.id)}
                            className={`flex items-center gap-4 p-4 rounded-[1.5rem] border-2 transition-all cursor-pointer group ${selectedEpisodes.has(ep.id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-500/5' : 'border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-800'}`}
                          >
                            <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${selectedEpisodes.has(ep.id) ? 'bg-blue-600 border-blue-600 scale-110' : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'}`}>
                              {selectedEpisodes.has(ep.id) && <Check size={16} className="text-white" strokeWidth={4} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black dark:text-gray-200 truncate leading-tight uppercase tracking-tight">E{ep.episode_num.toString().padStart(2, '0')} • {ep.title || ep.name}</p>
                              <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">{ep.container_extension || 'mkv'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {sortedSeasonKeys.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Search size={48} className="mb-4 opacity-20" />
                  <p className="font-bold text-lg uppercase tracking-widest">No matching episodes</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-8 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
          <div className="flex items-center gap-4 pl-4">
            <div className="bg-blue-600 w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Download size={24} className="text-white"/>
            </div>
            <div>
              <span className="block text-2xl font-black text-gray-900 dark:text-white leading-none">{selectedEpisodes.size}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black tracking-widest mt-1">Episodes Selected</span>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={onClose} className="px-8 py-4 text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest text-[10px] hover:text-gray-700 dark:hover:text-gray-200 transition-all">Dismiss</button>
            <button 
              onClick={handleQueueSelected}
              disabled={selectedEpisodes.size === 0}
              className="px-14 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95 flex items-center gap-3 disabled:opacity-50 disabled:shadow-none disabled:grayscale"
            >
              <Zap size={18}/> Send to Queue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main App Component ---

export default function App() {
  // Application State
  const [config, setConfig] = useState<Config | null>(null);
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
  const [showQueue, setShowQueue] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('view-mode') as ViewMode) || 'compact');

  // Custom Alert/Confirm State
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);

  const LIMIT = 50;

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('view-mode', viewMode);
  }, [viewMode]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(itemSearch), 300);
    return () => clearTimeout(timer);
  }, [itemSearch]);
  
  // Polling reference for the download queue
  const queuePollRef = useRef<any>(null);

  // Sync dark mode class with state
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('color-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('color-theme', 'light');
    }
  }, [isDarkMode]);

  // Initialize: Fetch settings and UA presets
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
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
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
        console.error('Invalid response format received from server:', data);
        throw new Error(data?.detail || 'Invalid response format from server');
      }
    } catch (err: any) {
      console.error('Failed to fetch items:', err);
      setError(err.message || 'An unexpected error occurred');
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Fetch current queue status (polled every 2s)
  const fetchQueue = useCallback(async () => {
    try {
      const data = await api.getQueue();
      setQueue(data);
    } catch (err) {
      console.error('Failed to fetch queue', err);
    }
  }, []);

  // Set up initial data loading and polling
  useEffect(() => {
    fetchConfig();
    fetchQueue();
    queuePollRef.current = setInterval(fetchQueue, 2000);
    return () => clearInterval(queuePollRef.current);
  }, [fetchConfig, fetchQueue]);

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

  // --- Filtered Data Computations ---

  const filteredCats = Array.isArray(categories) ? categories.filter(c => 
    c.category_name.toLowerCase().includes(catFilter.toLowerCase())
  ) : [];

  const displayItems = Array.isArray(items) ? items : [];

  // --- Event Handlers ---

  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      const updated = await api.updateConfig(config);
      setConfig(updated);
      setToast({ message: 'Settings saved successfully', type: 'success' });
      setShowSettings(false);
      if (updated.is_complete) {
        fetchCategories(activeTab);
      }
    } catch (err) {
      setToast({ message: 'Failed to save settings', type: 'error' });
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
      const safeMovieName = sanitiseFilename(rawName);
      const yearPart = item.year ? ` (${item.year})` : '';
      
      // FILENAME ON DISK: Title (Year).ext
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
          original_extension: primaryExt
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

  if (config && !config.is_complete) {
    return (
      <SetupWizard 
        config={config}
        setConfig={setConfig}
        onSave={handleSaveConfig}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden text-sm transition-colors duration-200 font-sans tracking-tight">
      {/* HEADER */}
      <header className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-4 md:px-8 py-3 md:py-5 shadow-sm flex items-center justify-between z-30">
        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 md:hidden text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
          >
            <Menu size={20} />
          </button>
          <div className="bg-blue-600 p-2 md:p-3 rounded-xl md:rounded-[1.25rem] shadow-xl shadow-blue-500/30">
            <Download className="text-white" size={20} strokeWidth={3} />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg md:text-xl font-black tracking-tighter text-gray-900 dark:text-white uppercase leading-none">Vodarr</h1>
            <p className="text-[8px] md:text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.3em] leading-none mt-1 pl-0.5">VOD Downloader</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-1 md:gap-2">
            <button 
              onClick={handleManualRefresh} 
              title="Refresh Catalog" 
              className="p-2 md:p-3 bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 rounded-xl md:rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-all active:scale-90 border dark:border-gray-800"
            >
              <RefreshCw size={20}/>
            </button>

            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              title="Toggle Theme" 
              className="p-2 md:p-3 bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 rounded-xl md:rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-90 border dark:border-gray-800"
            >
              {isDarkMode ? <Sun size={20}/> : <Moon size={20}/>}
            </button>

            <div className="w-px h-8 md:h-10 bg-gray-200 dark:bg-gray-800 mx-1 md:mx-2"></div>

            <button 
              onClick={() => setShowSettings(true)} 
              title="Settings" 
              className="p-2 md:p-3 bg-blue-600 text-white rounded-xl md:rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/30 active:scale-95 border-2 border-transparent hover:border-white/20"
            >
              <Settings size={20}/>
            </button>
          </div>
        </div>
      </header>

      {/* FEEDBACK & MODALS */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      
      {showSettings && (
        <SettingsModal 
          config={config} 
          setConfig={(c) => setConfig(c)}
          onSave={handleSaveConfig}
          onClose={() => setShowSettings(false)}
          uaPresets={uaPresets}
          onTest={() => api.testConnection().then(r => setToast({ message: r.message, type: r.status === 'success' ? 'success' : 'error' }))}
        />
      )}

      {selectedItem && (
        <ItemDetailsModal
          item={selectedItem}
          kind={activeTab}
          onClose={() => setSelectedItem(null)}
          onQueue={handleAddToQueue}
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

      {/* MAIN LAYOUT */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* SIDEBAR - Responsive Drawer */}
        <aside className={`${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} absolute md:relative w-72 h-full bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col shadow-xl md:shadow-sm z-40 transition-transform duration-300 ease-in-out`}>
          <div className="p-6 border-b dark:border-gray-800 flex flex-col gap-6 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="flex items-center justify-between md:hidden">
              <h2 className="font-black uppercase tracking-widest text-xs dark:text-white">Categories</h2>
              <button onClick={() => setShowSidebar(false)} className="p-2 text-gray-400"><X size={20}/></button>
            </div>
            {/* Tab Switcher */}
            <div className="flex bg-gray-200/50 dark:bg-gray-800/50 rounded-2xl p-1.5 border dark:border-gray-700 shadow-inner">
              <button 
                onClick={() => { setActiveTab('movies'); setShowSidebar(false); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[1.25rem] transition-all ${activeTab === 'movies' ? 'bg-white dark:bg-gray-700 shadow-md text-blue-600 dark:text-blue-400 font-black uppercase text-[10px] tracking-widest' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-black uppercase text-[10px] tracking-widest'}`}
              >
                <Film size={14}/> Movies
              </button>
              <button 
                onClick={() => { setActiveTab('series'); setShowSidebar(false); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[1.25rem] transition-all ${activeTab === 'series' ? 'bg-white dark:bg-gray-700 shadow-md text-blue-600 dark:text-blue-400 font-black uppercase text-[10px] tracking-widest' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-black uppercase text-[10px] tracking-widest'}`}
              >
                <Tv size={14}/> Series
              </button>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-4 top-3.5 text-gray-400" />
              <input 
                placeholder="Filter categories..."
                className="w-full pl-12 pr-10 py-3 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none border-none transition-all font-medium"
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
              />
              {catFilter && (
                <button onClick={() => setCatFilter('')} className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600">
                  <X size={16}/>
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
            <button 
              onClick={() => { setSelectedCat('0'); setShowSidebar(false); }}
              className={`w-full text-left px-6 py-3 rounded-2xl font-bold transition-all ${selectedCat === '0' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              All Categories
            </button>
            {filteredCats.map(cat => (
              <button 
                key={cat.category_id}
                onClick={() => { setSelectedCat(cat.category_id); setShowSidebar(false); }}
                className={`w-full text-left px-6 py-3 rounded-2xl font-bold transition-all flex items-center justify-between group ${selectedCat === cat.category_id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <span className="truncate">{cat.category_name}</span>
                <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-opacity ${selectedCat === cat.category_id ? 'opacity-100' : ''}`} />
              </button>
            ))}
          </div>
        </aside>

        {/* CONTENT AREA */}
        <section className="flex-1 flex flex-col bg-white dark:bg-gray-900 relative">
          <div className="p-4 md:p-6 border-b dark:border-gray-800 flex flex-col lg:flex-row gap-4 lg:items-center justify-between bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex flex-col">
              <h2 className="text-lg md:text-xl font-black text-gray-900 dark:text-white flex items-center gap-3 uppercase tracking-tight truncate">
                {activeTab === 'movies' ? <Film className="text-blue-600 flex-shrink-0" size={22}/> : <Tv className="text-blue-600 flex-shrink-0" size={22}/>}
                <span className="truncate">{categories.find(c => c.category_id === selectedCat)?.category_name || 'All Categories'}</span>
              </h2>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-8">{totalItems} items found</p>
            </div>
            
            <div className="flex items-center gap-3 md:gap-6 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
              {/* View Mode Switcher */}
              <div className="flex bg-gray-100 dark:bg-gray-800/50 rounded-2xl p-1 border dark:border-gray-800 shadow-inner flex-shrink-0">
                <button 
                  onClick={() => setViewMode('poster')}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'poster' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}
                >
                  <LayoutGrid size={18}/>
                </button>
                <button 
                  onClick={() => setViewMode('compact')}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'compact' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}
                >
                  <List size={18}/>
                </button>
                <button 
                  onClick={() => setViewMode('thin')}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'thin' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}
                >
                  <AlignJustify size={18}/>
                </button>
              </div>

              <div className="relative flex-1 lg:w-80 min-w-[200px]">
                <Search size={18} className="absolute left-5 top-3 text-gray-400" />
                <input 
                  placeholder={`Search...`}
                  className="w-full pl-14 pr-6 py-2.5 rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm font-medium"
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 flex-col gap-6 animate-in fade-in duration-500">
                <RefreshCw size={64} className="animate-spin text-blue-600" strokeWidth={3} />
                <div className="text-center space-y-1">
                  <p className="font-black uppercase tracking-[0.2em] text-[10px] text-gray-900 dark:text-white">
                    {isItemsCached ? 'Restoring from database...' : 'Syncing Library...'}
                  </p>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest opacity-60">Please wait a moment</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-500 flex-col gap-6">
                <div className="bg-red-100 dark:bg-red-900/30 p-6 rounded-full">
                  <AlertCircle size={64} strokeWidth={2.5}/>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-2xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Sync Failure</p>
                  <p className="text-sm font-medium opacity-60 max-w-xs mx-auto">{error}</p>
                </div>
                <button 
                  onClick={() => fetchItems(activeTab, selectedCat, debouncedSearch, 0, false, true)}
                  className="px-10 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-105 transition-all shadow-xl active:scale-95"
                >
                  Retry Sync
                </button>
              </div>
            ) : (
              <div className={`p-6 ${viewMode === 'poster' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-6' : 'flex flex-col space-y-1'}`}>
               {displayItems.map((item, idx) => {
                 if (viewMode === 'poster') {                    return (
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
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{item.display_year || item.year || 'N/A'}</p>
                        </div>
                      </div>
                    );
                  }

                  if (viewMode === 'compact') {
                    return (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedItem(item)}
                        className="px-6 py-3 rounded-[1.5rem] hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between group transition-all border border-transparent hover:border-gray-100 dark:hover:border-gray-800 cursor-pointer"
                      >
                        <div className="flex items-center gap-6 flex-1 min-w-0">
                          <div className="w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden flex-shrink-0 shadow-lg border-2 border-white dark:border-gray-800">
                            <SafeImage 
                              src={item.cover} 
                              className="w-full h-full object-cover" 
                              alt=""
                              fallbackIcon={activeTab === 'movies' ? Film : Tv}
                              iconSize={20}
                            />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-black text-gray-800 dark:text-gray-100 truncate uppercase tracking-tight" title={item.name}>{item.name}</h3>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-tighter">{item.display_year || item.year || 'N/A'}</span>
                              {activeTab === 'series' && <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Series</span>}
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleAddToQueue(item); }}
                          className="ml-6 bg-blue-600 text-white p-3 rounded-2xl font-bold hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-all active:scale-90 shadow-lg shadow-blue-500/30 flex items-center gap-2"
                        >
                          {activeTab === 'series' ? <ChevronRight size={20}/> : <Download size={20}/>}
                          {activeTab === 'series' && <span className="text-[10px] font-black uppercase tracking-widest px-1">Episodes</span>}
                        </button>
                      </div>
                    );
                  }

                  // Thin List
                  return (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedItem(item)}
                      className="px-4 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between group transition-all border border-transparent hover:border-gray-100 dark:hover:border-gray-800 cursor-pointer"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="text-[10px] font-black text-gray-400 w-8 tabular-nums">{(offset + idx + 1).toString().padStart(2, '0')}</span>
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate uppercase tracking-tight" title={item.name}>{item.name}</h3>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter opacity-60">({item.display_year || item.year || 'N/A'})</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleAddToQueue(item); }}
                        className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 p-1.5 rounded-lg hover:bg-blue-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                      >
                        {activeTab === 'series' ? <ChevronRight size={14}/> : <Download size={14}/>}
                      </button>
                    </div>
                  );
                })}
                
                <div className={`${viewMode === 'poster' ? 'col-span-full' : 'w-full'} flex justify-center p-12`}>
                  <button 
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-14 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] hover:scale-105 transition-all shadow-2xl active:scale-95 flex items-center gap-3 disabled:opacity-50"
                  >
                    {loadingMore ? <RefreshCw size={18} className="animate-spin" /> : <ChevronDown size={18}/>}
                    {loadingMore ? 'Loading Data...' : 'Load More Items'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* FOOTER - Responsive Queue */}
      <footer className={`${showQueue ? 'h-[80vh]' : 'h-16'} md:h-80 bg-white dark:bg-gray-900 border-t dark:border-gray-800 flex flex-col shadow-2xl z-50 transition-all duration-500 ease-in-out`}>
        <div 
          onClick={() => window.innerWidth < 768 && setShowQueue(!showQueue)}
          className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 px-4 md:px-8 py-3 md:py-4 flex items-center justify-between cursor-pointer md:cursor-default"
        >
          <div className="flex items-center gap-3 md:gap-8 min-w-0">
            <h3 className="text-xs md:text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-2 md:gap-3">
              <Download size={20} className="text-blue-600"/> 
              <span className="hidden xs:inline">Queue</span>
            </h3>
            
            <div className="flex items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full shadow-inner flex-shrink-0">
                <span className="text-[8px] md:text-[10px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest">{queue.length}</span>
              </div>
              <div className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900/30 px-3 py-1 rounded-full shadow-inner flex-shrink-0">
                <span className="text-[8px] md:text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">{queue.filter(i => i.status !== 'completed').length} Left</span>
              </div>
              {totalSpeed > 0 && (
                <div className="bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-full flex items-center gap-2 shadow-inner flex-shrink-0" title="Combined bandwidth and ETA">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
                  <span className="text-[8px] md:text-xs font-black text-green-700 dark:text-green-400 tabular-nums uppercase">
                    {formatSpeed(totalSpeed)} {window.innerWidth >= 768 && `• ${formatETA(globalETA)}`}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1 md:gap-2">
            <button onClick={(e) => { e.stopPropagation(); api.controlQueue('start'); }} title="Start All" className="p-2 md:p-2.5 bg-green-600 text-white rounded-lg md:rounded-xl hover:bg-green-700 transition-all active:scale-90 shadow-lg shadow-green-500/20"><Play size={16}/></button>
            <button onClick={(e) => { e.stopPropagation(); api.controlQueue('pause'); }} title="Pause All" className="p-2 md:p-2.5 bg-amber-500 text-white rounded-lg md:rounded-xl hover:bg-amber-600 transition-all active:scale-90 shadow-lg shadow-amber-500/20"><Pause size={16}/></button>
            <button onClick={(e) => { e.stopPropagation(); api.controlQueue('stop'); }} title="Stop All" className="p-2 md:p-2.5 bg-red-600 text-white rounded-lg md:rounded-xl hover:bg-red-700 transition-all active:scale-90 shadow-lg shadow-red-500/20 hidden sm:block"><Square size={16}/></button>
            
            <div className="w-px h-6 md:h-8 bg-gray-200 dark:bg-gray-800 mx-1 md:mx-2 hidden sm:block"></div>
            
            <button onClick={(e) => { e.stopPropagation(); api.controlQueue('restart-failed'); }} title="Retry Failures" className="p-2 md:p-2.5 bg-blue-600 text-white rounded-lg md:rounded-xl hover:bg-blue-700 transition-all active:scale-90 shadow-lg shadow-blue-500/20 hidden md:block"><RefreshCw size={16}/></button>
            <button onClick={(e) => { e.stopPropagation(); api.controlQueue('clear-completed'); }} title="Prune Completed" className="p-2 md:p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg md:rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all active:scale-90 shadow-sm hidden md:block"><Check size={16}/></button>
            <button onClick={(e) => { e.stopPropagation(); handleClearAll(); }} title="Wipe Queue" className="p-2 md:p-2.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg md:rounded-xl hover:bg-red-600 hover:text-white transition-all active:scale-90 shadow-sm hidden md:block"><Trash2 size={16}/></button>

            <button 
              onClick={(e) => { e.stopPropagation(); setShowQueue(!showQueue); }}
              className="p-2 md:hidden text-gray-400"
            >
              {showQueue ? <ChevronDown size={20}/> : <ChevronUp size={20}/>}
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
          <table className="w-full text-left border-collapse table-fixed md:table-auto">
            <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 md:px-8 py-3 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 w-1/2 md:w-auto">Title</th>
                <th className="px-4 md:px-8 py-3 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hidden md:table-cell">Class</th>
                <th className="px-4 md:px-8 py-3 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Status</th>
                <th className="px-4 md:px-8 py-3 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hidden sm:table-cell">Done</th>
                <th className="px-4 md:px-8 py-3 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 w-16 md:w-24 text-center">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800 text-[10px] md:text-sm">
              {queue.map(item => (
                <tr key={item.queue_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                  <td className="px-4 md:px-8 py-2 md:py-3">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] md:text-xs font-black text-gray-800 dark:text-gray-100 truncate uppercase tracking-tight" title={item.title}>{item.title}</span>
                        {item.total_size > 0 && (
                          <span className="text-[8px] md:text-[10px] font-bold text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0 hidden xs:inline bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md">
                            {formatSize(item.total_size)}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 md:px-8 py-2 md:py-3 hidden md:table-cell">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{item.kind}</span>
                  </td>
                  <td className="px-4 md:px-8 py-2 md:py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-block w-fit px-2 py-0.5 rounded-full text-[7px] md:text-[8px] font-black uppercase tracking-widest shadow-sm ${
                        item.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        item.status === 'downloading' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        item.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}>{item.status}</span>
                      
                      {item.status === 'downloading' && (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-[8px] md:text-[10px] font-bold text-blue-600 dark:text-blue-400 tabular-nums">{formatSpeed(item.speed)}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 md:px-8 py-2 md:py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 md:h-2.5 overflow-hidden border dark:border-gray-700">
                        <div className={`h-full transition-all duration-500 ${item.status === 'completed' ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${item.progress * 100}%` }}/>
                      </div>
                      <span className="text-[9px] md:text-[11px] font-black text-gray-600 dark:text-gray-400 tabular-nums">
                        {Math.round(item.progress * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 md:px-8 py-2 md:py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); api.removeFromQueue(item.queue_id); }} className="p-1.5 bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-red-600 hover:text-white rounded-lg transition-all"><Trash2 size={12}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-gray-400 dark:text-gray-600">
                    <p className="font-black uppercase tracking-[0.3em] text-[8px] md:text-[10px]">Queue Empty</p>
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
