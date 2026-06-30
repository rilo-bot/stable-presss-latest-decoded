// Article Studio chat engine — wires `useChat` to the article-agent transport and
// resolves the model's client tools in the browser (onToolCall → executeArticleTool
// → addToolResult). Mirrors useStoryChatSession.

import { useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { createArticleTransport } from './articleTransport';
import { executeArticleTool, isArticleClientTool } from './articleToolExecutor';

type AddToolResult = (a: { tool: string; toolCallId: string; output: unknown }) => void;

/** Flatten a UI message's text parts into a plain string. */
export function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function useArticleChatSession() {
  const transport = useMemo(() => createArticleTransport(), []);
  const addToolResultRef = useRef<AddToolResult | null>(null);

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (!isArticleClientTool(toolCall.toolName)) return;
      let output: unknown;
      try {
        output = await executeArticleTool(toolCall.toolName, toolCall.input);
      } catch (e) {
        output = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      addToolResultRef.current?.({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
    },
  });
  addToolResultRef.current = chat.addToolResult as unknown as AddToolResult;

  return chat;
}
