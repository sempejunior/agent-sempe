import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { Button } from "@/components/ui/button";
import { Bot, Menu, Plus, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatArea() {
  const { messages, activeSessionKey, sidebarOpen, toggleSidebar, newChat, sending, connected } =
    useStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const isEmpty = messages.length === 0 && !sending;
  const lastMsg = messages[messages.length - 1];
  const needsThinkingBubble =
    sending && (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.isStreaming);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        {!sidebarOpen && (
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <Menu className="w-5 h-5" />
          </Button>
        )}
        <div className="flex-1 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Bot className="w-4 h-4 text-green" />
          </div>
          <span className="text-sm font-semibold text-text-primary font-display">
            {activeSessionKey ? "Chat" : "New Chat"}
          </span>
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                connected
                  ? "bg-green shadow-[0_0_6px_rgba(17,199,111,0.5)]"
                  : "bg-yellow animate-pulse",
              )}
            />
            <span className="text-[10px] text-text-muted font-medium">
              {connected ? "Connected" : "Reconnecting..."}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={newChat} title="New Chat">
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/50 to-background">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center animate-fade-in-up">
            <div className="relative mb-8">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center shadow-lg shadow-emerald-500/5">
                <Cpu className="w-10 h-10 text-green" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-green flex items-center justify-center shadow-md">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <h2 className="font-display text-2xl font-bold text-text-primary mb-2">
              How can I help you?
            </h2>
            <p className="text-text-secondary text-sm max-w-md leading-relaxed">
              Ask me anything. I can help with research, coding, writing,
              analysis, and much more.
            </p>
          </div>
        ) : (
          <div>
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                isStreaming={msg.isStreaming}
                toolHint={msg.toolHint}
              />
            ))}
            {needsThinkingBubble && (
              <ChatMessage
                role="assistant"
                content=""
                isStreaming
              />
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  );
}
