// Blog Studio chat engine — wires `useChat` to the blog-agent transport and
// resolves the model's client tools in the browser (onToolCall → executeBlogTool →
// addToolResult). The destructive tools await a human click on a confirm card, so
// the tool loop naturally pauses there. Mirrors useStoryChatSession.

import { useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { createBlogTransport } from './blogTransport';
import { executeBlogTool, isBlogClientTool } from './blogToolExecutor';

type AddToolResult = (a: { tool: string; toolCallId: string; output: unknown }) => void;

/** Flatten a UI message's text parts into a plain string. */
export function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function useBlogChatSession() {
  const transport = useMemo(() => createBlogTransport(), []);
  const addToolResultRef = useRef<AddToolResult | null>(null);

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      // ALWAYS answer. `onToolCall` only fires for tools the server declared
      // without an `execute`, so every call that arrives here is ours to run — and
      // one that goes unanswered does not just fail, it poisons the conversation:
      // the dangling call is re-sent with every later message and the server throws
      // MissingToolResultsError on all of them until the user starts a new chat.
      //
      // This used to `return` early for any name missing from the executor's
      // hardcoded list, which made adding a tool server-side without updating that
      // list a silent chat-killer. `executeBlogTool` already reports an unknown
      // name as a normal failed result, so let it.
      let output: unknown;
      try {
        output = await executeBlogTool(toolCall.toolName, toolCall.input);
      } catch (e) {
        output = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (!isBlogClientTool(toolCall.toolName)) {
        // Worth knowing about: it still gets a result, but the tool is unwired.
        console.warn(`[blog-studio] ran an unregistered tool: ${toolCall.toolName}`);
      }
      addToolResultRef.current?.({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
    },
  });
  addToolResultRef.current = chat.addToolResult as unknown as AddToolResult;

  return chat;
}
