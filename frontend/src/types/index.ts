export interface Config {
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

export interface Category {
  category_id: string;
  category_name: string;
}

export interface Item {
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

export interface Episode {
  id: string;
  episode_num: number | string;
  season: number | string;
  title?: string;
  name?: string;
  container_extension: string;
}

export interface DownloadItem {
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
  meta?: any;
}

export type ViewMode = 'poster' | 'compact' | 'thin';
