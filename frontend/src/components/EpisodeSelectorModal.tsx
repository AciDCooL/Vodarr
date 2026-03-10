import { useState, useEffect } from 'react';
import { X, Search, RefreshCw, ChevronDown, CheckCircle2, Zap } from 'lucide-react';
import { Item, Config, Episode } from '../types';
import { api } from '../api/client';
import { sanitiseFilename } from '../utils/format';

export function EpisodeSelectorModal({ series, config, onClose, onQueue }: { series: Item, config: Config | null, onClose: () => void, onQueue: (items: any[]) => void }) {
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
