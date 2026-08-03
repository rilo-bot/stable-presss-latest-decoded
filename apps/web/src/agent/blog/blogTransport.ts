// Chat transport for the Blog Studio assistant: posts to /api/agent/blog/chat with
// the session Bearer token and a light BlogContext on every send — the member's
// name and role, plus which post (if any) the drawer was opened on, so "this post"
// resolves without the user having to name it.
//
// Same custom-fetch pattern as storyTransport. Note that nothing sent here widens
// what the assistant may DO: the prompt's capability lines are derived server-side
// from accountCan, and every tool is executed against the RBAC-gated REST routes.

import { DefaultChatTransport } from 'ai';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useBlogStudioUi } from '@/stores/blogStudioUiStore';

export function createBlogTransport() {
  return new DefaultChatTransport({
    api: apiUrl('/api/agent/blog/chat'),
    fetch: async (req, init) => {
      const { token, currentUser } = useAuthStore.getState();
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      let body = init?.body;
      if (typeof body === 'string') {
        try {
          // Read the studio state at SEND time, not at transport-construction
          // time — the user can open the drawer on one post, close it and reopen
          // it on another without the conversation restarting.
          const ui = useBlogStudioUi.getState();
          const parsed = JSON.parse(body);
          parsed.blogContext = {
            displayName: currentUser?.displayName,
            // A display label for the prompt; capabilities come from the server.
            role: currentUser?.access?.roles?.[0]?.label,
            mode: ui.mode,
            ...(ui.postId ? { postId: ui.postId } : {}),
            ...(ui.postTitle ? { postTitle: ui.postTitle } : {}),
            ...(ui.postStatus ? { postStatus: ui.postStatus } : {}),
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
