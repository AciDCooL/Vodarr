import { Config } from '../types';

export const api = {
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
  getStatus: () => api.request('/api/status').then(r => r.json()),
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
