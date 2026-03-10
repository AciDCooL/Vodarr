import { useState, useEffect } from 'react';
import { X, Clock, Calendar, Zap } from 'lucide-react';
import { Item } from '../types';
import { api } from '../api/client';
import { SafeImage } from './SafeImage';
import { Film, Tv } from 'lucide-react';

export function ItemDetailsModal({ item, kind, onClose, onQueue }: { item: Item, kind: 'movies' | 'series', onClose: () => void, onQueue: (item: Item) => void, setToast: any }) {
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
