import React, { useState, useEffect } from 'react';
import defaultAvatarImg from '../assets/avatars/_npe_Player.png';
import { getCachedAvatarUrl } from '../utils/avatarImageCache';

interface AvatarImageProps {
  avatarId?: string | null;
  className?: string;
  isOpponent?: boolean;
}

export function AvatarImage({
  avatarId,
  className = '',
  isOpponent = false,
}: AvatarImageProps) {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    if (avatarId && avatarId.trim().length > 0) {
      getCachedAvatarUrl(avatarId).then((url) => {
        if (active && url) {
          setCachedUrl(url);
        }
      });
    } else {
      setCachedUrl(null);
    }
    return () => {
      active = false;
    };
  }, [avatarId]);

  return (
    <div className={`relative flex items-end justify-center select-none ${className}`}>
      <img
        src={cachedUrl && !loadFailed ? cachedUrl : defaultAvatarImg}
        alt={avatarId || 'Avatar'}
        onError={() => setLoadFailed(true)}
        className={`h-full w-auto max-w-full object-contain object-bottom drop-shadow-2xl transition-transform duration-300 ${
          isOpponent ? 'scale-x-[-1]' : ''
        }`}
      />
    </div>
  );
}

export default AvatarImage;
