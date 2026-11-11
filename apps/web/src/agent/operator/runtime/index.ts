// ---------------------------------------------------------------------------
// Operator runtime — public surface. Packs import useAgentAction from here;
// the panel imports executeClientTool / isOperatorClientTool,
// setRouterNavigate and installTakeoverGuard.
// ---------------------------------------------------------------------------

export { useAgentAction, registerAction, getAction, listActions } from './registry';
export { createUiDriver } from './uiDriver';
export { readScreen } from './snapshot';
export { executeClientTool, isOperatorClientTool } from './clientTools';
export { setRouterNavigate } from './navigation';
export { installTakeoverGuard } from './takeover';
export { installNativeDialogs } from './nativeDialogs';
export { syncOperatorAttachments } from './attachmentsStore';
