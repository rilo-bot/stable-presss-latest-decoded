// Chat transport for the Story Studio assistant: posts to /api/agent/story/chat
// with the session Bearer token and a light StoryContext (the member's name +
// role, so the model can suggest a byline) on every send. Same custom-fetch
// pattern as the profile/editor assistants.

import { DefaultChatTransport } from 'ai';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export function createStoryTransport() {
  return new DefaultChatTransport({
    api: apiUrl('/api/agent/story/chat'),
    fetch: async (req, init) => {
      const { token, currentUser } = useAuthStore.getState();
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      let body = init?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          parsed.storyContext = {
            displayName: currentUser?.name,
            // A display label for the prompt; capabilities come from the server.
            role: currentUser?.access?.roles?.[0]?.label,
          };
          body = JSON.stringify(parsed);
        } catch {
          /* leave body untouched */
        }
      }
      return fetch(req as RequestInfo, { ...init, headers, body });
    },
  });
}
