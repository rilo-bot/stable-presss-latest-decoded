import * as React from 'react'

/**
 * Auto-grow a <textarea> as the user types: the box wraps text, grows up to
 * `maxLines` lines, then stays fixed and scrolls vertically. It also shrinks
 * back when the value is cleared (e.g. after sending a chat message).
 *
 * The cap is derived from the element's own computed style (line-height,
 * padding, border) rather than a hard-coded pixel height, so it stays correct
 * across the different font sizes the AI composers use. Because it writes to
 * `el.style.*` directly it works for both Tailwind- and inline-styled inputs.
 *
 * scrollHeight excludes the border, but the composers use border-box sizing, so
 * we add the top+bottom border back to avoid a spurious overflow → stray scrollbar.
 */
export function useAutoGrowTextarea(
  ref: React.RefObject<HTMLTextAreaElement>,
  value: string,
  maxLines = 5,
): void {
  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const cs = getComputedStyle(el)
    const fontSize = parseFloat(cs.fontSize) || 16
    let lineHeight = parseFloat(cs.lineHeight)
    if (!Number.isFinite(lineHeight)) lineHeight = fontSize * 1.2 // 'normal'
    const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    const maxHeight = lineHeight * maxLines + paddingY + borderY

    el.style.height = 'auto'
    const full = el.scrollHeight + borderY
    el.style.height = `${Math.min(full, maxHeight)}px`
    el.style.overflowY = full > maxHeight ? 'auto' : 'hidden'
  }, [ref, value, maxLines])
}
