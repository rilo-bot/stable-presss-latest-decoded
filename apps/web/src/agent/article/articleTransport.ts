// Chat transport for the Article Studio assistant: posts to
// /api/agent/article/chat with the session Bearer token and a fresh
// ArticleContext (the open article, its fields, and the selected field) on every
// send. Same custom-fetch pattern as the story/editor assistants.

import { DefaultChatTransport } from 'ai';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { buildArticleContext } from './articleContext';

export function createArticleTransport() {
  return new DefaultChatTransport({
    api: apiUrl('/api/agent/article/chat'),
    fetch: async (req, init) => {
      const token = useAuthStore.getState().token;
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      let body = init?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          parsed.articleContext = buildArticleContext();
          body = JSON.stringify(parsed);
        } catch {
          /* leave body untouched */
        }
      }
      return fetch(req as RequestInfo, { ...init, headers, body });
    },
  });
}
