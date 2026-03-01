import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Wrench, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock(props: React.ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(() => {
    const text = ref.current?.textContent || "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <div className="relative group/code">
      <pre ref={ref} className={props.className}>
        {props.children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-700/80 border border-slate-600/50 text-slate-400 hover:text-white hover:bg-slate-600 opacity-0 group-hover/code:opacity-100 transition-all cursor-pointer backdrop-blur-sm"
        title={copied ? "Copied!" : "Copy code"}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

const MD_COMPONENTS = {
  pre(props: React.ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
    return <CodeBlock {...props} />;
  },
};

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolHint?: string;
}

export function ChatMessage({ role, content, isStreaming, toolHint }: Props) {
  const isUser = role === "user";
  const isThinking = isStreaming && !content;

  return (
    <div
      className={cn(
        "flex gap-4 px-4 py-5 md:px-0",
        isUser ? "" : "bg-emerald-50/20",
      )}
    >
      <div className="w-full px-4 md:px-8 xl:px-24 mx-auto flex gap-4">
        {/* Avatar */}
        <div
          className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
            isUser
              ? "bg-slate-100 border border-slate-200"
              : "bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/60",
          )}
        >
          {isUser ? (
            <User className="w-4 h-4 text-text-secondary" />
          ) : (
            <Bot className="w-4 h-4 text-green" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-text-muted mb-1.5 uppercase tracking-wide">
            {isUser ? "You" : "Agent Semp\u00e9"}
          </div>

          {isUser ? (
            <div className="text-slate-800 text-base leading-relaxed whitespace-pre-wrap">
              {content}
            </div>
          ) : isThinking ? (
            <div className="flex items-center gap-3 py-2">
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200/60">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-green"
                      style={{ animation: `typing-dot 1.2s ${i * 0.2}s ease-in-out infinite` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-emerald-600 font-medium">Thinking...</span>
              </div>
            </div>
          ) : (
            <div className="markdown-body text-slate-800 text-base">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-5 bg-green ml-0.5 animate-pulse rounded-sm" />
              )}
            </div>
          )}

          {/* Tool hint */}
          {isStreaming && (
            <div className="h-9 mt-2">
              {toolHint && (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 w-fit animate-fade-in">
                  <Wrench className="w-3.5 h-3.5 text-green/70 animate-spin" />
                  <span className="text-xs text-text-secondary font-medium">{toolHint}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
