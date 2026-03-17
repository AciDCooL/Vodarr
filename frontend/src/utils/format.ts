export const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatSpeed = (bps: number) => {
  if (bps <= 0) return '';
  return `${formatSize(bps)}/s`;
};

export const formatETA = (seconds: number) => {
  if (!seconds || seconds === Infinity) return '∞';
  if (seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const sanitiseFilename = (name: string) => {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
};

export const stripExtension = (filename: string) => {
  return filename.replace(/\.(mp4|mkv|avi|ts|mov|wmv|flv|webm)$/i, '');
};
