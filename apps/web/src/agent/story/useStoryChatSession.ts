// Story Studio chat engine — wires `useChat` to the story-agent transport and
// resolves the model's client tools in the browser (onToolCall → executeStoryTool
// → addToolResult). The interactive tools await a user-completed card, so the
// tool loop naturally pauses on each step. Mirrors useProfileChatSession.

import { useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { createStoryTransport } from './storyTransport';
import { executeStoryTool, isStoryClientTool } from './storyToolExecutor';

type AddToolResult = (a: { tool: string; toolCallId: string; output: unknown }) => void;

/** Flatten a UI message's text parts into a plain string. */
export function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function useStoryChatSession() {
  const transport = useMemo(() => createStoryTransport(), []);
  const addToolResultRef = useRef<AddToolResult | null>(null);

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (!isStoryClientTool(toolCall.toolName)) return;
      let output: unknown;
      try {
        output = await executeStoryTool(toolCall.toolName, toolCall.input);
      } catch (e) {
        output = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      addToolResultRef.current?.({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
    },
  });
  addToolResultRef.current = chat.addToolResult as unknown as AddToolResult;

  return chat;
}
