// Chat transport for the Stable Studio assistant: posts to
// /api/agent/profile/chat with the session Bearer token and a fresh
// ProfileContext (the open horse/party snapshot) on every send — same
// custom-fetch pattern as the magazine editor assistant.

import { DefaultChatTransport } from 'ai';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useProfileAgentUi } from '@/stores/profileAgentUiStore';

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
          parsed.profileContext = useProfileAgentUi.getState().context;
          body = JSON.stringify(parsed);
        } catch {
          /* leave body untouched */
        }
      }
      return fetch(req as RequestInfo, { ...init, headers, body });
    },
  });
}
