import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import mtgaAvatarCatalog from '../data/mtgaAvatars.json';

export interface AvatarCacheStats {
  size_bytes: number;
  file_count: number;
}

// In-memory cache for fast lookup
const avatarSrcCache = new Map<string, string>();

/**
 * Normalizes an MTGA avatar ID string
 */
export function sanitizeAvatarId(avatarId?: string | null): string {
  if (!avatarId) return '';
  return avatarId.trim();
}

/**
 * Resolves an official MTGA character/card name from any avatar identifier
 * e.g. "Avatar_Basic_Cloud_FIN" -> "Cloud"
 * "Avatar_Basic_Chandra_FDN" -> "Chandra"
 * "Avatar_Basic_Ajani_DMU" -> "Ajani, Sleeper Agent"
 * "Avatar_Basic_Bolas_DragonGod" -> "Nicol Bolas, Dragon-God"
 */
export function resolveAvatarCharacterName(avatarId?: string | null): string | null {
  if (!avatarId) return null;
  const clean = avatarId.trim();

  // 1. Check official MTGA localization catalog
  const catalog = mtgaAvatarCatalog as Record<string, string>;
  if (catalog[clean]) {
    const val = catalog[clean];
    if (val && !val.startsWith('$/') && val !== 'The Adventurer') {
      return val;
    }
  }

  // 2. Try prefix/suffix normalized key in catalog
  const keyWithoutPrefix = clean.replace(/^Avatar_(Basic_|Portrait_|Standard_)?/i, '');
  if (catalog[keyWithoutPrefix]) {
    const val = catalog[keyWithoutPrefix];
    if (val && !val.startsWith('$/') && val !== 'The Adventurer') {
      return val;
    }
  }

  // 3. Fallback: sanitize name (strip set suffixes like _FIN, _FDN, _ELD, _M21)
  let fallback = keyWithoutPrefix.replace(/_[A-Z0-9]{2,5}$/i, '').replace(/_\d+$/i, '');
  fallback = fallback.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

  if (fallback && fallback.toLowerCase() !== 'adventurer' && fallback.length > 1) {
    return fallback;
  }

  return null;
}

/**
 * Checks if an avatar is cached locally on disk. If so, returns the local file URL.
 */
export async function getCachedAvatarUrl(avatarId?: string | null): Promise<string | null> {
  const cleanId = sanitizeAvatarId(avatarId);
  if (!cleanId) return null;

  if (avatarSrcCache.has(cleanId)) {
    return avatarSrcCache.get(cleanId)!;
  }

  try {
    const localPath = await invoke<string | null>('has_avatar_image', { avatarId: cleanId });
    if (localPath) {
      const srcUrl = `${convertFileSrc(localPath)}?v=1.3.10-crop2`;
      avatarSrcCache.set(cleanId, srcUrl);
      return srcUrl;
    }
  } catch (err) {
    console.debug('Failed checking avatar disk cache:', err);
  }

  return null;
}

/**
 * Saves downloaded avatar image data to disk cache.
 */
export async function saveCachedAvatar(avatarId: string, data: Uint8Array): Promise<string | null> {
  const cleanId = sanitizeAvatarId(avatarId);
  if (!cleanId) return null;

  try {
    const localPath = await invoke<string>('save_avatar_image', {
      avatarId: cleanId,
      data: Array.from(data),
    });
    const srcUrl = convertFileSrc(localPath);
    avatarSrcCache.set(cleanId, srcUrl);
    return srcUrl;
  } catch (err) {
    console.error('Failed saving avatar to disk cache:', err);
    return null;
  }
}

/**
 * Gets disk cache statistics for avatars.
 */
export async function getAvatarCacheStats(): Promise<AvatarCacheStats> {
  try {
    return await invoke<AvatarCacheStats>('get_avatar_cache_stats');
  } catch (err) {
    console.error('Failed fetching avatar cache stats:', err);
    return { size_bytes: 0, file_count: 0 };
  }
}

/**
 * Clears all cached avatar images from disk.
 */
export async function clearAvatarCache(): Promise<AvatarCacheStats> {
  avatarSrcCache.clear();
  try {
    return await invoke<AvatarCacheStats>('clear_avatar_cache');
  } catch (err) {
    console.error('Failed clearing avatar cache:', err);
    return { size_bytes: 0, file_count: 0 };
  }
}
