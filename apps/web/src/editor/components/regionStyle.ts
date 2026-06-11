import type { CSSProperties } from 'react';
import type { TextStyle } from '@/types/magazine';
import { resolveFontStack } from '../fonts/registry';

/** Convert a stored TextStyle into inline CSS for a text region. */
export function textStyleToCss(style: TextStyle): CSSProperties {
  return {
    fontFamily: resolveFontStack(style.fontFamily),
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    color: style.color,
    textAlign: style.align,
    lineHeight: style.lineHeight ?? 1.35,
    letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
    textTransform: style.textTransform ?? 'none',
    margin: 0,
  };
}
