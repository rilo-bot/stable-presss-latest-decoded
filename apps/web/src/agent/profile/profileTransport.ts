// Chat transport for the Stable Studio assistant: posts to
// /api/agent/profile/chat with the session Bearer token and a fresh
// ProfileContext (the open horse/party snapshot) on every send — same
// custom-fetch pattern as the magazine editor assistant.

import { DefaultChatTransport } from 'ai';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useProfileAgentUi } from '@/stores/profileAgentUiStore';
import { profileBoxDef } from './profileStudioFields';

export function createProfileTransport() {
  return new DefaultChatTransport({
    api: apiUrl('/api/agent/profile/chat'),
    fetch: async (req, init) => {
      const token = useAuthStore.getState().token;
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      let body = init?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          const { context, selectedFieldId } = useProfileAgentUi.getState();
          // Merge the focused data-box (purple ring) into the context so the
          // assistant acts on it by default — same shape as the article studio.
          const box = profileBoxDef(selectedFieldId);
          const selection = box ? { key: box.key, label: box.label, kind: box.kind, fields: box.fields, role: box.role } : null;
          parsed.profileContext = context ? { ...context, selection } : context;
          body = JSON.stringify(parsed);
        } catch {
          /* leave body untouched */
        }
      }
      return fetch(req as RequestInfo, { ...init, headers, body });
    },
  });
}
