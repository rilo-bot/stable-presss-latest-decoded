// ---------------------------------------------------------------------------
// Operator navigation bridge.
//
// The runtime lives outside the React tree (the model's tool calls arrive in
// plain async code), but in-app navigation must go through react-router so the
// SPA re-renders instead of reloading. The panel — which IS inside the router —
// hands us its `navigate` via setRouterNavigate(). Until it does (or after it
// unmounts), we fall back to history.pushState + a popstate event, which
// react-router's BrowserRouter listens to, so the route still changes.
// ---------------------------------------------------------------------------

type NavigateFn = (path: string) => void;

let routerNavigate: NavigateFn | null = null;

/** Called by the panel with react-router's navigate (pass null on unmount). */
export function setRouterNavigate(fn: NavigateFn | null): void {
  routerNavigate = fn;
}

function fallbackNavigate(path: string): void {
  window.history.pushState({}, '', path);
  // BrowserRouter subscribes to popstate; pushState alone does not fire it.
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

/** The navigate function the runtime should use right now. */
export function getRouterNavigate(): NavigateFn {
  return routerNavigate ?? fallbackNavigate;
}
