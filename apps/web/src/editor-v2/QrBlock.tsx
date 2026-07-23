// Magazine Builder v2 — a page's live QR code, rendered from its destination URL
// with qrcode.react (never a stored image), so the editor and public canvas can
// never drift. One shared component; same quiet zone, colours, and empty-state
// rule everywhere. (Web statically depends on qrcode.react already.)

import { QRCodeSVG } from 'qrcode.react';
import type { CSSProperties } from 'react';
import type { ElementQrData } from './model';

export function QrBlock({
  qr,
  showHint = false,
  linkInNewTab = false,
}: {
  qr: ElementQrData;
  /** Editor: render a "set a link" placeholder for an unlinked QR box. */
  showHint?: boolean;
  /** Public view: wrap the code in a link so a click opens the destination. */
  linkInNewTab?: boolean;
}) {
  // No destination yet (extraction can't recover where a printed QR pointed).
  // Public pages show nothing rather than a dead code; the editor passes
  // showHint to render a fill-me-in placeholder instead.
  if (!qr.url) {
    if (!showHint) return null;
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: qr.bg,
          border: '1px dashed rgba(0,0,0,0.35)',
          color: 'rgba(0,0,0,0.45)',
          fontSize: 11,
          textAlign: 'center',
          padding: 4,
        }}
      >
        QR — set a link
      </div>
    );
  }

  const boxStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    background: qr.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // The QR spec's quiet zone: breathing room so scanners lock on.
    padding: '6%',
    boxSizing: 'border-box',
  };
  const code = (
    <div style={boxStyle}>
      <QRCodeSVG
        value={qr.url}
        fgColor={qr.fg}
        bgColor={qr.bg}
        size={256}
        level="M"
        marginSize={0}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );

  if (linkInNewTab) {
    return (
      <a
        href={qr.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${qr.url}`}
        style={{ display: 'block', width: '100%', height: '100%' }}
      >
        {code}
      </a>
    );
  }
  return code;
}
