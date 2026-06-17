// Shared Stable Studio chat engine — one place that wires `useChat` to the
// profile-agent transport and resolves the model's client tools in the browser
// (onToolCall → executeProfileTool → addToolResult). Consumed by BOTH the
// right-side drawer (ProfileAgentPanel) and the floating mascot guide
// (OnboardingGuide), so they never drift. Staging/undo live in the store +
// applyProposals.ts; this hook is just the conversation + tool loop.

import { useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { createProfileTransport } from './profileTransport';
import { executeProfileTool, isProfileClientTool } from './profileToolExecutor';

type AddToolResult = (a: { tool: string; toolCallId: string; output: unknown }) => void;

/** Flatten a UI message's text parts into a plain string. */
export function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function useProfileChatSession() {
  const transport = useMemo(() => createProfileTransport(), []);
  const addToolResultRef = useRef<AddToolResult | null>(null);

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (!isProfileClientTool(toolCall.toolName)) return;
      let output: unknown;
      try {
        output = await executeProfileTool(toolCall.toolName, toolCall.input);
      } catch (e) {
        output = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      addToolResultRef.current?.({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
    },
  });
  addToolResultRef.current = chat.addToolResult as unknown as AddToolResult;

  return chat;
}
