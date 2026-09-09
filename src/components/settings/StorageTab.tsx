import React from 'react';
import { Download, Trash2, RefreshCw } from 'lucide-react';
import { CustomDropdown } from '../CustomDropdown';
import { MTG_COLORS, formatBytes } from './types';

export interface StorageTabProps {
  palette: any;
  isSearching: boolean;

  // Search match flags
  matchDbStats: boolean;
  matchAutoBackup: boolean;
  matchImageCache: boolean;
  matchCacheQuota: boolean;
  matchCardDbSync: boolean;
  matchSetCatalog: boolean;

  // Database stats & actions
  dbStats: any;
  autoBackupEnabled: boolean;
  dbExporting: boolean;
  dbExportSuccess: string | null;
  onToggleAutoBackup: (val: boolean) => void;
  onExportDb: () => void;

  // Image cache stats & actions
  cacheStats: { size_bytes: number; file_count: number } | null;
  imageCacheQuota: string;
  imageCacheQuotaOptions: { value: string; label: string }[];
  cacheDownloading: boolean;
  cacheClearing: boolean;
  downloadProgress: string | null;
  cacheClearSuccess: boolean;
  onChangeImageCacheQuota: (val: string) => void;
  onPreDownloadArt: () => void;
  onClearCache: () => void;

  // Avatar cache stats & actions
  avatarCacheStats: { size_bytes: number; file_count: number } | null;
  avatarDownloading: boolean;
  avatarClearing: boolean;
  avatarDownloadProgress: string | null;
  avatarClearSuccess: boolean;
  onExtractAvatarsFromClient: () => void;
  onClearAvatarCache: () => void;

  // Card Universe sync
  cardDbStatus: any;
  cardDbSyncing: boolean;
  onSyncCardDb: () => void;

  // Scryfall Set Catalog
  setMetaStatus: { known_count: number; last_updated: string | null } | null;
  setMetaBusy: boolean;
  onRefreshSets: () => void;
}

export const StorageTab: React.FC<StorageTabProps> = ({
  palette,
  isSearching,
  matchDbStats,
  matchAutoBackup,
  matchImageCache,
  matchCacheQuota,
  matchCardDbSync,
  matchSetCatalog,
  dbStats,
  autoBackupEnabled,
  dbExporting,
  dbExportSuccess,
  onToggleAutoBackup,
  onExportDb,
  cacheStats,
  imageCacheQuota,
  imageCacheQuotaOptions,
  cacheDownloading,
  cacheClearing,
  downloadProgress,
  cacheClearSuccess,
  onChangeImageCacheQuota,
  onPreDownloadArt,
  onClearCache,
  avatarCacheStats,
  avatarDownloading,
  avatarClearing,
  avatarDownloadProgress,
  avatarClearSuccess,
  onExtractAvatarsFromClient,
  onClearAvatarCache,
  cardDbStatus,
  cardDbSyncing,
  onSyncCardDb,
  setMetaStatus,
  setMetaBusy,
  onRefreshSets,
}) => {
  return (
    <div className="space-y-6">
      {/* SQLite Database Management */}
      {(matchDbStats || matchAutoBackup || !isSearching) && (
        <div className="space-y-3">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
              SQLite Database Management
            </span>
            <span className="text-xs font-mono text-neutral-400">
              {dbStats?.db_filename ?? 'rhystic.db'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[9.5px] font-mono uppercase text-neutral-500">Total Recorded Matches</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                {dbStats?.match_count?.toLocaleString() ?? 0}
              </p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[9.5px] font-mono uppercase text-neutral-500">Database File Size</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                {formatBytes(dbStats?.size_bytes ?? 0)}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[9.5px] font-mono uppercase text-neutral-500">Database Disk Path</p>
            <p className="text-xs font-mono text-neutral-400 break-all p-2 border border-white/10 bg-white/[0.02]">
              {dbStats?.db_path ?? '—'}
            </p>
          </div>

          {/* Auto-Backup Toggle */}
          <div className="flex items-center justify-between p-3 border border-white/10 bg-white/[0.02]">
            <div className="space-y-0.5 pr-2">
              <p className="text-xs font-bold text-white font-sans uppercase">Automated Weekly Database Backups</p>
              <p className="text-[11px] font-sans text-neutral-400">Automatically creates timestamped SQLite backups on app launch.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoBackupEnabled}
              onClick={() => onToggleAutoBackup(!autoBackupEnabled)}
              style={autoBackupEnabled ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
              className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                autoBackupEnabled ? '' : 'bg-white/[0.04] border-white/15'
              }`}
            >
              <span
                style={autoBackupEnabled ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                className={`inline-block h-3 w-3 transform transition-transform ${
                  autoBackupEnabled ? 'translate-x-5' : 'translate-x-1 bg-neutral-500'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={onExportDb}
              disabled={dbExporting}
              style={{ backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border }}
              className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" style={{ color: MTG_COLORS.green.text }} />
              {dbExporting ? 'Exporting…' : 'Backup Database to File…'}
            </button>
            {dbExportSuccess && (
              <span className="text-xs font-mono" style={{ color: MTG_COLORS.green.text }}>{dbExportSuccess}</span>
            )}
          </div>
        </div>
      )}

      {/* Local Card Image Cache */}
      {(matchImageCache || matchCacheQuota || !isSearching) && (
        <div className="space-y-3 pt-2">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
              Local Card Image Cache & Quota
            </span>
            <span className="text-xs font-mono text-neutral-400">
              {formatBytes(cacheStats?.size_bytes ?? 0)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[9.5px] font-mono uppercase text-neutral-500">Cached Illustrations</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                {cacheStats?.file_count?.toLocaleString() ?? 0} files
              </p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[9.5px] font-mono uppercase text-neutral-500">Cache Storage Used</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                {formatBytes(cacheStats?.size_bytes ?? 0)}
              </p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-3 space-y-1">
              <p className="text-[9.5px] font-mono uppercase text-neutral-500 font-bold">Storage Cap</p>
              <CustomDropdown
                options={imageCacheQuotaOptions}
                value={imageCacheQuota}
                onChange={onChangeImageCacheQuota}
                palette={palette}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={onPreDownloadArt}
              disabled={cacheDownloading}
              style={{ backgroundColor: MTG_COLORS.blue.bg, borderColor: MTG_COLORS.blue.border }}
              className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${cacheDownloading ? 'animate-bounce' : ''}`} style={{ color: MTG_COLORS.blue.text }} />
              {cacheDownloading ? 'Pre-downloading…' : 'Pre-download Collection Art'}
            </button>
            <button
              onClick={onClearCache}
              disabled={cacheClearing || (cacheStats?.file_count ?? 0) === 0}
              style={{ backgroundColor: MTG_COLORS.red.bg, borderColor: MTG_COLORS.red.border }}
              className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" style={{ color: MTG_COLORS.red.text }} />
              {cacheClearing ? 'Clearing…' : 'Clear Image Cache'}
            </button>
          </div>
          {downloadProgress && (
            <p className="text-xs font-mono animate-pulse" style={{ color: MTG_COLORS.green.text }}>{downloadProgress}</p>
          )}
          {cacheClearSuccess && (
            <p className="text-xs font-mono" style={{ color: MTG_COLORS.green.text }}>Card image cache successfully cleared.</p>
          )}
        </div>
      )}

      {/* Arena Avatar Asset Cache */}
      {(matchImageCache || !isSearching) && (
        <div className="space-y-3 pt-2">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
              Arena Avatar Asset Cache
            </span>
            <span className="text-xs font-mono text-neutral-400">
              {formatBytes(avatarCacheStats?.size_bytes ?? 0)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[9.5px] font-mono uppercase text-neutral-500">Cached Avatars</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                {avatarCacheStats?.file_count?.toLocaleString() ?? 0} avatars
              </p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[9.5px] font-mono uppercase text-neutral-500">Avatar Storage Used</p>
              <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                {formatBytes(avatarCacheStats?.size_bytes ?? 0)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={onExtractAvatarsFromClient}
              disabled={avatarDownloading}
              style={{ backgroundColor: MTG_COLORS.blue.bg, borderColor: MTG_COLORS.blue.border }}
              className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${avatarDownloading ? 'animate-bounce' : ''}`} style={{ color: MTG_COLORS.blue.text }} />
              {avatarDownloading ? 'Extracting…' : 'Extract Avatars from MTGA Client'}
            </button>
            <button
              onClick={onClearAvatarCache}
              disabled={avatarClearing || (avatarCacheStats?.file_count ?? 0) === 0}
              style={{ backgroundColor: MTG_COLORS.red.bg, borderColor: MTG_COLORS.red.border }}
              className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" style={{ color: MTG_COLORS.red.text }} />
              {avatarClearing ? 'Clearing…' : 'Clear Avatar Cache'}
            </button>
          </div>
          {avatarDownloadProgress && (
            <p className="text-xs font-mono animate-pulse" style={{ color: MTG_COLORS.green.text }}>{avatarDownloadProgress}</p>
          )}
          {avatarClearSuccess && (
            <p className="text-xs font-mono" style={{ color: MTG_COLORS.green.text }}>Avatar cache successfully cleared.</p>
          )}
        </div>
      )}

      {/* MTGA Card Database & Scryfall Metadata Sync */}
      {(matchCardDbSync || matchSetCatalog || !isSearching) && (
        <div className="space-y-3 pt-2">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
              MTGA Universe & Scryfall Metadata
            </span>
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Catalog Sources</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Card DB Index */}
            {(matchCardDbSync || !isSearching) && (
              <div className="border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">MTGA Card Universe</p>
                  <button
                    onClick={onSyncCardDb}
                    disabled={cardDbSyncing}
                    style={{ color: MTG_COLORS.blue.text }}
                    className="text-[10px] font-mono font-bold hover:underline uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${cardDbSyncing ? 'animate-spin' : ''}`} />
                    {cardDbSyncing ? 'Syncing…' : 'Re-sync'}
                  </button>
                </div>
                <p className="text-base font-mono font-bold text-white tabular-nums">
                  {cardDbStatus?.card_count ? (
                    <span style={{ color: MTG_COLORS.green.text }}>{cardDbStatus.card_count.toLocaleString()} Cards</span>
                  ) : (
                    <span style={{ color: MTG_COLORS.gold.text }}>0 Cards</span>
                  )}
                </p>
                <p className="text-[9.5px] font-mono text-neutral-500 break-all truncate">
                  {cardDbStatus?.raw_path || 'Auto-scan enabled'}
                </p>
              </div>
            )}

            {/* Scryfall Set Metadata */}
            {(matchSetCatalog || !isSearching) && (
              <div className="border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">Scryfall Set Catalog</p>
                  <button
                    onClick={onRefreshSets}
                    disabled={setMetaBusy}
                    style={{ color: MTG_COLORS.blue.text }}
                    className="text-[10px] font-mono font-bold hover:underline uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${setMetaBusy ? 'animate-spin' : ''}`} />
                    {setMetaBusy ? 'Updating…' : 'Update Sets'}
                  </button>
                </div>
                <p className="text-base font-mono font-bold text-white tabular-nums">
                  {setMetaStatus?.known_count ?? 0} Sets Known
                </p>
                <p className="text-[9.5px] font-mono text-neutral-500">
                  Last Updated: {setMetaStatus?.last_updated ? new Date(setMetaStatus.last_updated).toLocaleDateString() : 'Never'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
