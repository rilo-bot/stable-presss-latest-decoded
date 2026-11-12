// <img> that falls back to the API file proxy when a direct S3 URL won't load.
// See lib/assetUrl.ts for why. One retry only: if the proxy fails too, the
// browser's normal broken-image state shows (with the alt text), as before.

import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { proxiedAssetUrl } from '@/lib/assetUrl';

export function ResilientImg({ src, onError, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const [current, setCurrent] = useState(src);
  // A new src from the parent (another image chosen, page re-rendered) resets
  // the fallback.
  useEffect(() => setCurrent(src), [src]);
  return (
    <img
      {...rest}
      src={current}
      onError={(e) => {
        const proxied = current === src ? proxiedAssetUrl(src) : null;
        if (proxied) {
          setCurrent(proxied);
          return;
        }
        onError?.(e);
      }}
    />
  );
}
