// Chat transport for the Studio Assistant: posts to /api/agent/editor/chat with
// the session Bearer token and a fresh EditorContext (current magazine/page) on
// every send — same custom-fetch pattern as the global AgentWidget.

import { DefaultChatTransport } from 'ai';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { buildEditorContext } from './editorContext';

export function createEditorTransport() {
  return new DefaultChatTransport({
    api: apiUrl('/api/agent/editor/chat'),
    fetch: async (req, init) => {
      const token = useAuthStore.getState().token;
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      let body = init?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          parsed.editorContext = buildEditorContext();
          body = JSON.stringify(parsed);
        } catch {
          /* leave body untouched */
        }
      }
      return fetch(req as RequestInfo, { ...init, headers, body });
    },
  });
}
