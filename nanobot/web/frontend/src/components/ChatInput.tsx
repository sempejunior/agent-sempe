import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

export function ChatInput() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, sending, connected } = useStore();
  const wasSendingRef = useRef(false);

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  useEffect(() => {
    if (wasSendingRef.current && !sending) {
      textareaRef.current?.focus();
    }
    wasSendingRef.current = sending;
  }, [sending]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !connected) return;
    sendMessage(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-slate-100 bg-white/80 backdrop-blur-sm px-4 py-4">
      <div className="w-full px-4 md:px-8 xl:px-24 mx-auto">
        <div className="flex items-end gap-3 rounded-[20px] border border-slate-200 bg-white p-2 pr-3 focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:shadow-lg focus-within:shadow-emerald-500/5 transition-all duration-300 shadow-sm">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "Send a message..." : "Reconnecting..."}
            disabled={sending}
            rows={2}
            className="flex-1 bg-transparent text-slate-800 placeholder:text-slate-400 text-base leading-relaxed resize-none focus:outline-none pl-3 py-2.5 max-h-[240px]"
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!text.trim() || sending || !connected}
            className="shrink-0 w-10 h-10 rounded-xl"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
