import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Download, Pause, Play, Trash2, RefreshCw, Search, X, 
  Settings, Server, Folder, 
  ChevronRight, Film, Tv, CheckCircle2, AlertCircle,
  Sun, Moon, Clock, Save, ChevronDown, 
  ShieldCheck, HardDrive, Zap, Globe, AlertTriangle, Check,
  LayoutGrid, List, AlignJustify, Power, Calendar, Menu, GripVertical,
  Maximize2, Minimize2, Copy
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
  auto_retry_queue_limit: number;
  enable_download_window: boolean;
  check_stream_limit: boolean;
  stream_limit_check_interval: number;
  is_stream_limit_reached: boolean;
  retry_start_hour: number;
  retry_end_hour: number;
  connect_timeout: number;
  read_timeout: number;
  media_management: boolean;
  debug_mode: boolean;
  admin_username: string;
  admin_password?: string;
  api_key: string;
  auth_bypass_local: boolean;
  is_complete: boolean;
  is_in_window: boolean;
}

interface Category {
  category_id: string;
  category_name: string;
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
  getAuthToken: () => localStorage.getItem('vodarr_token'),
  setAuthToken: (token: string) => localStorage.setItem('vodarr_token', token),
  clearAuthToken: () => localStorage.removeItem('vodarr_token'),

  request: async (url: string, options: RequestInit = {}) => {
    const token = api.getAuthToken();
    const configStr = localStorage.getItem('vodarr_config');
    const localApiKey = configStr ? JSON.parse(configStr).api_key : null;

    const headers: any = {
      ...(options.headers || {})
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (localApiKey) {
      headers['X-Api-Key'] = localApiKey;
    }
    
    const resp = await fetch(url, { ...options, headers });
    
    if (resp.status === 401) {
      const isAuthRoute = url.includes('/api/auth/login') || url.includes('/api/auth/status');
      if (!isAuthRoute) {
        api.clearAuthToken();
        window.location.reload();
      }
    }
    return resp;
  },

  getAuthStatus: () => api.request('/api/auth/status').then(r => r.json()),
  login: async (credentials: any) => {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return resp.json();
  },

  getConfig: () => api.request('/api/config').then(r => r.json()),
  updateConfig: async (config: Partial<Config>) => {
    const resp = await api.request('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Update failed');
    return data;
  },
  getUAPresets: () => api.request('/api/common-user-agents').then(r => r.json()),
  testConnection: () => api.request('/api/test-connection').then(r => r.json()),
  getAccountInfo: () => api.request('/api/account').then(r => r.json()),
  getCategories: (kind: 'movies' | 'series', refresh: boolean = false) => api.request(`/api/categories/${kind}${refresh ? '?refresh=true' : ''}`).then(r => r.json()),
  getItems: (kind: 'movies' | 'series', catId: string, search?: string, offset: number = 0, limit: number = 50, refresh: boolean = false) => {
    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
    });
    if (search) params.append('search', search);
    if (refresh) params.append('refresh', 'true');
    return api.request(`/api/items/${kind}/${catId}?${params.toString()}`).then(r => r.json());
  },
  getSeriesInfo: (seriesId: string) => api.request(`/api/series/${seriesId}`).then(r => r.json()),
  getMovieInfo: (streamId: string) => api.request(`/api/movie/${streamId}`).then(r => r.json()),
  browseFolders: (path?: string) => api.request(`/api/browse-folders?path=${encodeURIComponent(path || '')}`).then(r => r.json()),
  getQueue: () => api.request('/api/queue').then(r => r.json()),
  addToQueue: (items: any[]) => api.request('/api/queue/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  }).then(r => r.json()),
  controlQueue: (action: string) => api.request(`/api/queue/control/${action}`, { method: 'POST' }).then(r => r.json()),
  removeFromQueue: (queueId: string) => api.request(`/api/queue/${queueId}`, { method: 'DELETE' }).then(r => r.json()),
  restartItem: (queueId: string) => api.request(`/api/queue/restart/${queueId}`, { method: 'POST' }).then(r => r.json()),
  reorderQueue: (queueIds: string[]) => api.request('/api/queue/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queue_ids: queueIds })
  }).then(r => r.json()),
  restartSystem: () => api.request('/api/system/restart', { method: 'POST' }).then(r => r.json()),
  shutdownSystem: () => api.request('/api/system/shutdown', { method: 'POST' }).then(r => r.json()),
};

// --- Helper Formatting ---

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatSpeed = (bps: number) => {
  if (bps <= 0) return '';
  return `${formatSize(bps)}/s`;
};

const formatETA = (seconds: number) => {
  if (!seconds || seconds === Infinity) return '∞';
  if (seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const sanitiseFilename = (name: string) => {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
};

// --- Custom UI Components ---

function SafeImage({ src, alt, className, fallbackIcon: Icon, iconSize = 24 }: { src?: string, alt: string, className?: string, fallbackIcon?: any, iconSize?: number }) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div className={`${className} bg-gray-100 dark:bg-gray-800 flex items-center justify-center relative overflow-hidden`}>
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <Icon size={iconSize * 2} />
        </div>
        <div className="bg-red-500/10 text-red-500 p-2 rounded-full transform -rotate-12 border-2 border-red-500/20 shadow-lg">
          <X size={iconSize} className="animate-in spin-in-12" />
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

function Toast({ message, type, onClose }: { message: string, type: 'success' | 'error' | 'info', onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 1000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[1000] animate-in slide-in-from-top-10 duration-500">
      <div className={`px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-4 border-2 ${
        type === 'success' ? 'bg-green-500 border-green-400 text-white' : 
        type === 'error' ? 'bg-red-500 border-red-400 text-white' : 
        'bg-blue-600 border-blue-400 text-white'
      }`}>
        {type === 'success' ? <CheckCircle2 size={20}/> : type === 'error' ? <AlertCircle size={20}/> : <RefreshCw className="animate-spin" size={20}/>}
        <span className="font-black uppercase tracking-widest text-[10px] whitespace-nowrap">{message}</span>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel }: { title: string, message: string, onConfirm: () => void, onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[600] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border dark:border-gray-800 animate-in zoom-in-95 duration-300">
        <div className="p-10 md:p-12 space-y-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-3xl flex items-center justify-center text-red-600 mx-auto">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{title}</h3>
            <p className="text-gray-500 dark:text-gray-400 font-medium">{message}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={onCancel} className="px-6 py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95">Cancel</button>
            <button onClick={onConfirm} className="px-6 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-500/20 active:scale-95">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Login Modal Component ---

function LoginModal({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.login({ username, password });
      if (data.access_token) {
        api.setAuthToken(data.access_token);
        onLogin();
      } else {
        setError(data.detail || 'Login failed');
      }
    } catch (err) {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[500] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border dark:border-gray-800 animate-in zoom-in-95 duration-500">
        <div className="p-10 md:p-12 space-y-10">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white mx-auto shadow-2xl shadow-blue-500/40 animate-bounce-slow">
              <ShieldCheck size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">Identity Check</h2>
              <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mt-3">Authentication Required</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Username</label>
              <input 
                autoFocus
                className="w-full border-none rounded-2xl px-6 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Password</label>
              <input 
                type="password"
                className="w-full border-none rounded-2xl px-6 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-xs font-bold text-red-500 text-center bg-red-50 dark:bg-red-900/20 py-3 rounded-xl border border-red-100 dark:border-red-800/50">{error}</p>}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin mx-auto" size={18} /> : 'Unlock Application'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// --- Folder Selector Component ---

function FolderSelectorModal({ currentPath, onClose, onSelect }: { currentPath: string, onClose: () => void, onSelect: (path: string) => void }) {
  const [folders, setFolders] = useState<string[]>([]);
  const [path, setPath] = useState(currentPath);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.browseFolders(path);
        setFolders(data.folders || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [path]);

  const goUp = () => {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    setPath('/' + parts.join('/'));
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] shadow-2xl w-full max-w-2xl h-[600px] overflow-hidden flex flex-col border dark:border-gray-800">
        <div className="p-8 md:p-10 border-b dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-950/50">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Select Folder</h3>
            <p className="text-xs font-mono text-gray-400 break-all">{path || '/'}</p>
          </div>
          <button onClick={onClose} className="p-3 bg-white dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-2xl shadow-xl transition-all active:scale-90"><X size={24}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-2 bg-white dark:bg-gray-900">
          <button 
            onClick={goUp}
            className="w-full text-left px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl flex items-center gap-4 text-blue-600 font-black uppercase text-[10px] tracking-[0.2em] transition-all"
          >
            <ChevronDown size={18} className="rotate-90" /> Parent Directory
          </button>
          
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 opacity-50">
              <RefreshCw className="animate-spin" size={32} />
              <span className="text-[10px] font-black uppercase tracking-widest">Scanning Disk...</span>
            </div>
          ) : (
            folders.map((folder, idx) => (
              <button 
                key={idx}
                onClick={() => setPath(folder)}
                className="w-full text-left px-6 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl flex items-center gap-4 group transition-all"
              >
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <Folder size={18}/>
                </div>
                <span className="font-bold text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">{folder.split('/').pop()}</span>
              </button>
            ))
          )}
        </div>

        <div className="p-8 bg-gray-50 dark:bg-gray-950/50 border-t dark:border-gray-800 flex gap-4">
          <button onClick={() => onSelect(path)} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-blue-500/40 hover:bg-blue-700 transition-all active:scale-95">Set Download Path</button>
        </div>
      </div>
    </div>
  );
}

// --- Setup Wizard Component ---

function SetupWizard({ config, setConfig, onSave }: { config: Config, setConfig: (c: Config) => void, onSave: () => void }) {
  const [step, setStep] = useState<'provider' | 'storage' | 'security' | 'finish'>('provider');
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const steps = [
    { id: 'provider', label: 'Provider', icon: <Server size={20}/>, description: 'Xtream API Details' },
    { id: 'storage', label: 'Storage', icon: <Folder size={20}/>, description: 'Download Paths' },
    { id: 'security', label: 'Security', icon: <ShieldCheck size={20}/>, description: 'Admin Access' },
    { id: 'finish', label: 'Ready', icon: <CheckCircle2 size={20}/>, description: 'Finalize Setup' },
  ] as const;

  const handleNext = () => {
    if (step === 'provider') setStep('storage');
    else if (step === 'storage') setStep('security');
    else if (step === 'security') setStep('finish');
  };

  const handleBack = () => {
    if (step === 'storage') setStep('provider');
    else if (step === 'security') setStep('storage');
    else if (step === 'finish') setStep('security');
  };

  return (
    <div className="fixed inset-0 bg-gray-100 dark:bg-gray-950 z-[400] flex items-center justify-center p-4">
      {showFolderPicker && (
        <FolderSelectorModal 
          currentPath={config.download_dir}
          onClose={() => setShowFolderPicker(false)}
          onSelect={(p) => setConfig({...config, download_dir: p})}
        />
      )}
      <div className="bg-white dark:bg-gray-900 rounded-[4rem] shadow-2xl w-full max-w-4xl overflow-hidden border dark:border-gray-800 flex flex-col md:flex-row h-[700px]">
        {/* Sidebar */}
        <div className="w-full md:w-80 bg-blue-600 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32 blur-3xl" />
          <div className="relative z-10 space-y-12">
            <div className="space-y-2">
              <h1 className="text-4xl font-black uppercase tracking-tighter italic leading-none">Vodarr<span className="text-blue-200">.</span></h1>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-200 opacity-80">Initial Configuration</p>
            </div>
            
            <div className="space-y-8">
              {steps.map((s, idx) => (
                <div key={s.id} className={`flex items-center gap-6 transition-all duration-500 ${step === s.id ? 'translate-x-2' : 'opacity-40 grayscale scale-95'}`}>
                  <div className={`w-14 h-14 rounded-3xl flex items-center justify-center shadow-2xl ${step === s.id ? 'bg-white text-blue-600 scale-110 rotate-3' : 'bg-blue-500 text-white'}`}>
                    {s.icon}
                  </div>
                  <div className="hidden lg:block">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Step 0{idx + 1}</p>
                    <p className="text-lg font-black uppercase tracking-tight leading-none">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-[10px] font-medium leading-relaxed opacity-60">Complete these steps to unlock your VOD library and start high-speed downloads.</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-12 md:p-20 flex flex-col justify-between bg-white dark:bg-gray-900">
          <div className="space-y-10">
            {step === 'provider' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Xtream API</h2>
                  <p className="text-sm text-gray-500 font-medium">Enter your IPTV provider credentials to sync the catalog.</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Server URL</label>
                    <input 
                      className="w-full border-none rounded-3xl px-8 py-5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold text-lg"
                      placeholder="http://provider.com:8080"
                      value={config.base_url} 
                      onChange={e => setConfig({...config, base_url: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Username</label>
                      <input 
                        className="w-full border-none rounded-3xl px-8 py-5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        value={config.username} 
                        onChange={e => setConfig({...config, username: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Password</label>
                      <input 
                        type="password"
                        className="w-full border-none rounded-3xl px-8 py-5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        value={config.password} 
                        onChange={e => setConfig({...config, password: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'storage' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Storage</h2>
                  <p className="text-sm text-gray-500 font-medium">Where should we save your high-quality downloads?</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Download Path</label>
                    <div className="flex gap-4">
                      <input 
                        className="flex-1 border-none rounded-3xl px-8 py-5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        value={config.download_dir} 
                        onChange={e => setConfig({...config, download_dir: e.target.value})}
                      />
                      <button 
                        onClick={() => setShowFolderPicker(true)}
                        className="w-20 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-3xl hover:bg-blue-600 hover:text-white transition-all active:scale-95 border-2 border-transparent hover:border-blue-500/20"
                      >
                        <Folder size={20}/>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'security' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Security</h2>
                  <p className="text-sm text-gray-500 font-medium">Protect administrative access to your Vodarr instance.</p>
                </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6 bg-blue-50/50 dark:bg-blue-900/10 p-8 rounded-[3rem] border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 ml-1">Admin Username</label>
                      <input 
                        className="w-full border-none rounded-2xl px-6 py-4 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        value={config.admin_username} 
                        onChange={e => setConfig({...config, admin_username: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 ml-1">Admin Password</label>
                      <input 
                        type="password"
                        className="w-full border-none rounded-2xl px-6 py-4 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        placeholder="Required"
                        value={config.admin_password || ''} 
                        onChange={e => setConfig({...config, admin_password: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'finish' && (
              <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 text-center">
                <div className="w-24 h-24 bg-green-500 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-green-500/40">
                  <Check size={48} strokeWidth={4} />
                </div>
                <div className="space-y-4">
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Ready to Go</h2>
                  <p className="text-sm text-gray-500 font-medium max-w-sm mx-auto">Your configuration is complete. Press the button below to sync your provider's library.</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            {step !== 'provider' && (
              <button onClick={handleBack} className="px-10 py-5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-3xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95">Back</button>
            )}
            
            {step !== 'finish' ? (
              <button 
                onClick={handleNext}
                disabled={step === 'security' && !config.admin_password}
                className="flex-1 py-5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-3xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] transition-all shadow-2xl active:scale-95 disabled:opacity-50"
              >
                Continue <ChevronRight className="inline-block ml-2" size={16}/>
              </button>
            ) : (
              <button 
                onClick={onSave}
                className="flex-1 py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95"
              >
                Finish Setup
              </button>
            )}
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
  onTest,
  setToast
}: { 
  config: Config | null, 
  setConfig: (c: Config) => void, 
  onSave: () => void, 
  onClose: () => void,
  uaPresets: Record<string, string>,
  onTest: () => void,
  setToast: (t: { message: string, type: 'success' | 'error' | 'info' }) => void
}) {  const [activeGroup, setActiveGroup] = useState<'server' | 'downloads' | 'security' | 'retries' | 'window' | 'system'>('server');
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

  const handleLogout = () => {
    api.clearAuthToken();
    window.location.reload();
  };

  const groups = [
    { id: 'server', label: 'Server & API', icon: <Server size={18} /> },
    { id: 'downloads', label: 'Downloads', icon: <HardDrive size={18} /> },
    { id: 'security', label: 'Security', icon: <ShieldCheck size={18} /> },
    { id: 'retries', label: 'Retries', icon: <RefreshCw size={18} /> },
    { id: 'window', label: 'Window', icon: <Clock size={18} /> },
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
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl w-full max-w-6xl overflow-hidden border dark:border-gray-800 flex flex-col md:flex-row h-[700px]">
        {/* Settings Sidebar */}
        <div className="w-full md:w-64 bg-gray-50 dark:bg-gray-950 border-r dark:border-gray-800 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-10 pl-2">
              <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/30">
                <Settings className="text-white" size={18} />
              </div>
              <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter leading-none">Settings</h2>
            </div>
            
            <nav className="space-y-2">
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => setActiveGroup(group.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-xs uppercase tracking-widest ${activeGroup === group.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {group.icon} {group.label}
                </button>
              ))}
            </nav>
          </div>

          <button
            onClick={onTest}
            className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-all border dark:border-gray-800 active:scale-95"
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

          <div className="flex-1 p-10 overflow-y-auto space-y-8 text-sm">
            {activeGroup === 'server' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Server Credentials</h3>
                  <p className="text-sm text-gray-500">Update your Xtream API connection details.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Base URL</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                      <input 
                        className="w-full border-none rounded-2xl px-12 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        placeholder="http://provider.com:8080"
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
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Storage & Identity</h3>
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
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Cache Expiry (Hours)</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.cache_expiry_hours} 
                        onChange={e => setConfig({...config, cache_expiry_hours: parseInt(e.target.value) || 24})}
                      />
                    </div>
                    <div className="space-y-2 flex flex-col justify-end">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">User Agent</label>
                      <div className="relative">
                        <select
                          className="w-full appearance-none border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[10px] tracking-tight truncate pr-10"
                          value={config.user_agent}
                          onChange={e => setConfig({...config, user_agent: e.target.value})}
                        >
                          {Object.entries(uaPresets).map(([label, val]) => (
                            <option key={label} value={val as string}>{label}</option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-3.5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Media Management</h4>
                        <span className="bg-blue-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm">Radarr/Sonarr</span>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Organize downloads into "Title (Year)" and "Season X" subfolders.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.media_management}
                        onChange={e => setConfig({...config, media_management: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-all"></div>
                    </label>
                  </div>

                  <div className="pt-6 border-t dark:border-gray-800 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Bandwidth & Limits</h4>
                    <div className="flex items-center justify-between p-6 bg-amber-50/50 dark:bg-amber-900/10 rounded-[2rem] border border-amber-100 dark:border-amber-800/50">
                      <div className="space-y-1">
                        <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Check Stream Limit</h4>
                        <p className="text-xs text-gray-500">Prevent starting downloads if your active IPTV streams are full.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={config.check_stream_limit}
                          onChange={e => setConfig({...config, check_stream_limit: e.target.checked})}
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 transition-all"></div>
                      </label>
                    </div>

                    <div className={`space-y-2 transition-all ${!config.check_stream_limit ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Check Interval (Seconds)</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.stream_limit_check_interval} 
                        onChange={e => setConfig({...config, stream_limit_check_interval: parseInt(e.target.value) || 60})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeGroup === 'retries' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Retries & Timeouts</h3>
                  <p className="text-sm text-gray-500">Configure how the app handles network interruptions.</p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-amber-50/50 dark:bg-amber-900/10 rounded-[2rem] border border-amber-100 dark:border-amber-800/50">
                    <div className="space-y-1">
                      <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Auto-Retry Failed</h4>
                      <p className="text-xs text-gray-500">Automatically re-queue failed downloads.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.auto_retry_failed}
                        onChange={e => setConfig({...config, auto_retry_failed: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 transition-all"></div>
                    </label>
                  </div>

                  <div className={`grid grid-cols-2 gap-6 transition-all ${!config.auto_retry_failed ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Max Retries per Item</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.max_retries} 
                        onChange={e => setConfig({...config, max_retries: parseInt(e.target.value) || 3})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Queue Retry Limit</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.auto_retry_queue_limit} 
                        onChange={e => setConfig({...config, auto_retry_queue_limit: parseInt(e.target.value) || 10})}
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t dark:border-gray-800 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Network Timeouts (Seconds)</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Connection Timeout</label>
                        <input 
                          type="number"
                          className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                          value={config.connect_timeout} 
                          onChange={e => setConfig({...config, connect_timeout: parseInt(e.target.value) || 5})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Read Timeout</label>
                        <input 
                          type="number"
                          className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                          value={config.read_timeout} 
                          onChange={e => setConfig({...config, read_timeout: parseInt(e.target.value) || 10})}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium italic pl-1">
                      Lower values detect dead links faster. Recommended: 3s - 5s.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeGroup === 'window' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Download Window</h3>
                  <p className="text-sm text-gray-500">Restrict download activity to specific hours of the day.</p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2rem] border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-1">
                      <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Enable Window</h4>
                      <p className="text-xs text-gray-500">Only download during the specified time range.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.enable_download_window}
                        onChange={e => setConfig({...config, enable_download_window: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-all"></div>
                    </label>
                  </div>

                  <div className={`grid grid-cols-2 gap-6 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-[2rem] transition-all duration-300 ${!config.enable_download_window ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase pl-1">Start Time</span>
                      <div className="relative">
                         <select
                           className="w-full appearance-none border-none rounded-2xl px-5 py-3.5 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-sm cursor-pointer"
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
                           className="w-full appearance-none border-none rounded-2xl px-5 py-3.5 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-sm cursor-pointer"
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
                  <p className="text-[10px] text-gray-500 italic text-center px-4">
                    Active downloads will pause outside this window and resume automatically when it opens.
                  </p>
                </div>
              </div>
            )}

            {activeGroup === 'security' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Identity & Security</h3>
                  <p className="text-sm text-gray-500">Manage administrative access and authentication policies.</p>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Admin Username</label>
                      <input 
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.admin_username} 
                        onChange={e => setConfig({...config, admin_username: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Change Password</label>
                      <input 
                        type="password"
                        placeholder="Leave blank to keep current"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium italic"
                        value={config.admin_password || ''} 
                        onChange={e => setConfig({...config, admin_password: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">REST API Access</label>
                    <div className="flex gap-3">
                      <div className="relative group flex-1">
                        <input 
                          readOnly
                          className="w-full border-none rounded-2xl px-6 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 font-mono text-xs focus:ring-0 outline-none"
                          value={config.api_key} 
                        />
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(config.api_key);
                            setToast({ message: 'API Key copied to clipboard', type: 'success' });
                          }}
                          className="absolute right-4 top-3.5 p-1 text-gray-400 hover:text-blue-500 transition-colors"
                          title="Copy API Key"
                        >
                          <Copy size={16}/>
                        </button>
                      </div>
                      <button 
                        onClick={() => setConfig({...config, api_key: Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')})}
                        className="px-6 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 rounded-2xl hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 transition-all border border-transparent hover:border-amber-500/20 active:scale-95"
                        title="Regenerate API Key"
                      >
                        <RefreshCw size={18}/>
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500 italic pl-1">Use this key in the "X-Api-Key" header for automation.</p>
                  </div>

                  <div className="flex items-center justify-between p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2rem] border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-1">
                      <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Local Address Bypass</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">Disable authentication for requests originating from local networks (LAN).</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.auth_bypass_local}
                        onChange={e => setConfig({...config, auth_bypass_local: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-all"></div>
                    </label>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={handleLogout}
                      className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-red-500 dark:text-red-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 flex items-center justify-center gap-3 border border-transparent hover:border-red-500/20"
                    >
                      <Power size={16}/> Terminate Current Session
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeGroup === 'system' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">System Maintenance</h3>
                  <p className="text-sm text-gray-500">Manage the application lifecycle and logging.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-6 bg-gray-50 dark:bg-gray-800/50 rounded-[2rem] border dark:border-gray-700">
                    <div className="space-y-1">
                      <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Debug Mode</h4>
                      <p className="text-xs text-gray-500">Enable verbose logging to stdout for troubleshooting.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.debug_mode}
                        onChange={e => setConfig({...config, debug_mode: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-all"></div>
                    </label>
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

                    <div className="p-6 bg-gray-50 dark:bg-gray-800/40 rounded-[2rem] border dark:border-gray-800 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600">
                          <Power size={24} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Shutdown</h4>
                          <p className="text-xs text-gray-500">Stops the application process completely.</p>
                        </div>
                        <button 
                          onClick={() => api.shutdownSystem()}
                          className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-700 transition-all active:scale-95"
                        >
                          Shutdown
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-8 md:p-10 bg-gray-50 dark:bg-gray-950/50 border-t dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 font-bold text-xs uppercase tracking-widest">
              <ShieldCheck size={14}/> 
              <span>Protected Session</span>
            </div>
            <button 
              onClick={onSave}
              className="px-12 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95 flex items-center gap-3"
            >
              <Save size={18}/> Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Item Details Modal Component ---

function ItemDetailsModal({ item, kind, onClose, onQueue }: { item: Item, kind: 'movies' | 'series', onClose: () => void, onQueue: (item: Item) => void, setToast: any }) {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const data = kind === 'movies' ? await api.getMovieInfo(item.stream_id!.toString()) : await api.getSeriesInfo(item.series_id!.toString());
        setInfo(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchInfo();
  }, [item, kind]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[300] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[4rem] shadow-2xl w-full max-w-6xl h-[800px] overflow-hidden flex flex-col md:flex-row border dark:border-gray-800 animate-in zoom-in-95 duration-500">
        {/* Cover Section */}
        <div className="w-full md:w-[400px] h-64 md:h-full relative overflow-hidden group">
          <SafeImage 
            src={item.cover} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
            alt={item.name}
            fallbackIcon={kind === 'movies' ? Film : Tv}
            iconSize={64}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-60" />
          <div className="absolute bottom-10 left-10 right-10 space-y-2">
             <div className="flex gap-2">
               {item.rating && <span className="bg-amber-500 text-black px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-xl">IMDB {item.rating}</span>}
               {item.container_extension && <span className="bg-blue-600 text-white px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-xl">{item.container_extension}</span>}
             </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-10 md:p-16 space-y-10 overflow-y-auto custom-scrollbar">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="px-4 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">{kind === 'movies' ? 'Feature Film' : 'TV Collection'}</span>
                <button onClick={onClose} className="p-4 bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-[2rem] transition-all active:scale-90"><X size={28}/></button>
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">{item.name}</h2>
              <div className="flex items-center gap-6 text-gray-500 dark:text-gray-400 font-bold text-sm">
                {(info?.duration_secs || info?.duration) && (
                  <div className="flex items-center gap-2">
                    <Clock size={16} />
                    <span>
                      {info.duration_secs ? `${Math.floor(info.duration_secs / 60)}m` : info.duration}
                    </span>
                  </div>
                )}
                {(info?.releaseDate || item.year || item.display_year) && (
                  <div className="flex items-center gap-2">
                    <Calendar size={16} />
                    <span>{info?.releaseDate || item.year || item.display_year}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 text-sm leading-relaxed">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Storyline</h3>
              <p className="text-gray-600 dark:text-gray-300 text-lg font-medium">{info?.plot || item.plot || 'No description available for this title.'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Cast</h3>
                <p className="font-bold text-gray-700 dark:text-gray-200">{info?.cast || item.cast || 'Information hidden'}</p>
              </div>
              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Director</h3>
                <p className="font-bold text-gray-700 dark:text-gray-200">{info?.director || item.director || 'Various'}</p>
              </div>
            </div>
          </div>

          <div className="p-10 md:p-16 bg-gray-50 dark:bg-gray-950/50 border-t dark:border-gray-800 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Provider Source</span>
              <span className="font-mono text-xs dark:text-gray-400 opacity-60">ID: {item.stream_id || item.series_id}</span>
            </div>
            <button 
              onClick={() => { onQueue(item); onClose(); }}
              className="px-14 py-5 bg-blue-600 text-white rounded-[2rem] font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95 flex items-center gap-3"
            >
              <Zap size={20}/> {kind === 'series' ? 'Browse Episodes' : 'Send to Queue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Episode Selector Modal Component ---

function EpisodeSelectorModal({ series, config, onClose, onQueue }: { series: Item, config: Config | null, onClose: () => void, onQueue: (items: any[]) => void }) {
  const [seasons, setSeasons] = useState<Record<string, Episode[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const data = await api.getSeriesInfo(series.series_id!.toString());
        setSeasons(data.episodes || {});
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [series]);

  const toggleEpisode = (id: string) => {
    const next = new Set(selectedEpisodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEpisodes(next);
  };

  const toggleSeason = (_seasonKey: string, episodes: Episode[]) => {
    const next = new Set(selectedEpisodes);
    const seasonEpIds = episodes.map(e => e.id.toString());
    const allSelected = seasonEpIds.every(id => next.has(id));
    
    if (allSelected) {
      seasonEpIds.forEach(id => next.delete(id));
    } else {
      seasonEpIds.forEach(id => next.add(id));
    }
    setSelectedEpisodes(next);
  };

  const selectAllSeasons = () => {
    const allEpIds = Object.values(seasons).flat().map(e => e.id.toString());
    const allSelected = allEpIds.length > 0 && allEpIds.every(id => selectedEpisodes.has(id));
    
    if (allSelected) {
      setSelectedEpisodes(new Set());
    } else {
      setSelectedEpisodes(new Set(allEpIds));
    }
  };

  const handleQueueSelected = () => {
    const toQueue: any[] = [];
    const baseUrl = config?.base_url;
    const user = config?.username;
    const pass = config?.password;

    Object.values(seasons).forEach(eps => {
      eps.forEach(ep => {
        if (selectedEpisodes.has(ep.id.toString())) {
          const streamId = ep.id;
          const ext = ep.container_extension || 'mp4';
          
          const safeSeriesName = sanitiseFilename(series.name);
          const safeEpTitle = ep.title ? ` - ${sanitiseFilename(ep.title)}` : '';
          const sNum = ep.season.toString().padStart(2, '0');
          const eNum = ep.episode_num.toString().padStart(2, '0');
          
          const filename = `${safeSeriesName} - S${sNum}E${eNum}${safeEpTitle}.${ext}`;
          const streamUrl = `${baseUrl}/series/${user}/${pass}/${streamId}.${ext}`;
          const targetPath = `${config?.download_dir}/TV/${safeSeriesName}/Season ${sNum}/${filename}`;

          toQueue.push({
            item_id: streamId,
            title: filename,
            stream_url: streamUrl,
            target_path: targetPath,
            kind: 'episode',
            meta: { 
              original_extension: ext,
              series_name: series.name,
              season_num: ep.season,
              episode_num: ep.episode_num,
              episode_title: ep.title
            }
          });
        }
      });
    });

    onQueue(toQueue);
    onClose();
  };

  const sortedSeasonKeys = Object.keys(seasons).sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[300] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[4rem] shadow-2xl w-full max-w-6xl h-[85vh] overflow-hidden flex flex-col border dark:border-gray-800 animate-in zoom-in-95 duration-500">
        <div className="p-8 md:p-12 border-b dark:border-gray-800 flex flex-col md:flex-row gap-8 md:items-center bg-gray-50/50 dark:bg-gray-950/50">
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">{series.name}</h2>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">Episode Selector</p>
          </div>
          
          <div className="flex-1 flex items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
              <input 
                placeholder="Search episodes..."
                className="w-full pl-12 pr-6 py-3.5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button onClick={onClose} className="p-4 bg-white dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-[2rem] shadow-xl transition-all active:scale-90"><X size={28}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 md:p-12">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-6 opacity-50">
              <RefreshCw className="animate-spin text-blue-600" size={64} strokeWidth={3} />
              <span className="text-[10px] font-black uppercase tracking-widest">Discovering Seasons...</span>
            </div>
          ) : (
            <div className="space-y-12">
              {sortedSeasonKeys.map(seasonKey => {
                const episodes = seasons[seasonKey].filter(e => 
                  !searchTerm || (e.title || e.name || '').toLowerCase().includes(searchTerm.toLowerCase())
                );
                if (episodes.length === 0) return null;
                const allSelected = episodes.every(id => selectedEpisodes.has(id.id.toString()));

                return (
                  <div key={seasonKey} className="space-y-6">
                    <div className="flex items-center justify-between border-b dark:border-gray-800 pb-4">
                      <h3 className="text-xl font-black dark:text-white uppercase tracking-tighter italic flex items-center gap-3">
                        Season {seasonKey.padStart(2, '0')}
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest not-italic opacity-60">({episodes.length} episodes)</span>
                      </h3>
                      <button 
                        onClick={() => toggleSeason(seasonKey, episodes)}
                        className={`px-6 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${allSelected ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}
                      >
                        {allSelected ? 'Deselect All' : 'Select Season'}
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                      {episodes.map(ep => (
                        <div 
                          key={ep.id}
                          onClick={() => toggleEpisode(ep.id.toString())}
                          className={`group flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${selectedEpisodes.has(ep.id.toString()) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-lg' : 'border-transparent bg-gray-50 dark:bg-gray-800/40 hover:border-gray-200 dark:hover:border-gray-700'}`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-all ${selectedEpisodes.has(ep.id.toString()) ? 'bg-blue-600 text-white shadow-lg' : 'bg-white dark:bg-gray-700 text-gray-400'}`}>
                            {ep.episode_num}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-bold truncate ${selectedEpisodes.has(ep.id.toString()) ? 'text-blue-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                              {ep.title || ep.name || `Episode ${ep.episode_num}`}
                            </h4>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Ready to queue</p>
                          </div>
                          {selectedEpisodes.has(ep.id.toString()) && (
                            <div className="bg-blue-600 text-white p-1 rounded-full shadow-lg animate-in zoom-in duration-200">
                              <CheckCircle2 size={16} strokeWidth={3}/>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-8 md:p-12 bg-gray-50 dark:bg-gray-950/50 border-t dark:border-gray-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${selectedEpisodes.size > 0 ? 'bg-blue-600 text-white shadow-2xl shadow-blue-500/40' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
              <Zap size={24} strokeWidth={2.5}/>
            </div>
            <div>
              <span className="block text-2xl font-black text-gray-900 dark:text-white leading-none">{selectedEpisodes.size}</span>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Episodes Selected</span>
            </div>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={selectAllSeasons}
              className="px-8 py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95"
            >
              {Object.values(seasons).flat().length > 0 && Object.values(seasons).flat().every(e => selectedEpisodes.has(e.id.toString())) ? 'Deselect All' : 'Select All Seasons'}
            </button>
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

export default function App() {
  // Application State
  const [config, setConfig] = useState<Config | null>(null);
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
  const [isQueueMaximized, setIsQueueMaximized] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('view-mode') as ViewMode) || 'compact');
  const [posterSize, setPosterSize] = useState(() => parseInt(localStorage.getItem('poster-size') || '160'));
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
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
      const safeMovieName = sanitiseFilename(rawName);
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
    } catch (err) {
      console.error('Failed to fetch queue', err);
    }
  }, []);

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

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      
      {showSettings && (
        <SettingsModal 
          config={config} 
          setConfig={setConfig}
          onSave={handleSaveConfig}
          onClose={() => setShowSettings(false)}
          uaPresets={uaPresets}
          onTest={() => api.testConnection().then(r => setToast({ message: r.message, type: r.status === 'success' ? 'success' : 'error' }))}
          setToast={setToast}
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
          <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
            <button onClick={() => setSelectedCat('0')} className={`w-full text-left px-6 py-3 rounded-2xl ${selectedCat === '0' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''}`}>All Categories</button>
            {filteredCats.map(cat => (
              <button key={cat.category_id} onClick={() => setSelectedCat(cat.category_id)} className={`w-full text-left px-6 py-3 rounded-2xl truncate ${selectedCat === cat.category_id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''}`}>{cat.category_name}</button>
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
                <input placeholder="Search..." className="w-64 pl-12 py-2 rounded-xl border dark:border-gray-700 dark:bg-gray-800" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
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

      <footer className={`${isQueueMaximized ? 'fixed inset-0 z-[150] h-full' : 'fixed bottom-0 left-0 right-0 z-50 h-80'} bg-white dark:bg-gray-900 border-t dark:border-gray-800 flex flex-col shadow-2xl transition-all duration-500 overflow-hidden`}>
        <div className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 px-8 py-4 flex items-center justify-between">
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
          <div className="flex gap-2">
            <button onClick={() => api.controlQueue('start')} className="p-2.5 bg-green-600 text-white rounded-xl" title="Start All"><Play size={16}/></button>
            <button onClick={() => api.controlQueue('pause')} className="p-2.5 bg-amber-500 text-white rounded-xl" title="Pause All"><Pause size={16}/></button>
            <button onClick={() => api.controlQueue('clear-completed')} className="p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl" title="Clear Completed"><Check size={16}/></button>
            <button onClick={handleClearAll} className="p-2.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-600 hover:text-white transition-all" title="Wipe Queue"><Trash2 size={16}/></button>
            <button onClick={() => setIsQueueMaximized(!isQueueMaximized)} className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl">
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
                        }`}>{item.status}</span>
                        
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
                        onClick={(e) => { e.stopPropagation(); api.restartItem(item.queue_id); }} 
                        className={`p-1.5 rounded-lg transition-all ${item.status === 'completed' ? 'opacity-20 pointer-events-none' : 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`}
                        title="Retry Item"
                      >
                        <RefreshCw size={14}/>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); api.removeFromQueue(item.queue_id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-all" title="Remove Item">
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
