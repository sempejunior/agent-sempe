import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Wrench, Copy, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TurnStep } from "@/lib/store";

const TRUNCATION_MARK = "... (truncated)";

/** O que o agente fez para chegar na resposta, fechado por padrão.
 *
 *  Fica fechado porque quem lê a conversa quer a conversa; abre porque quando
 *  algo deu errado, a única resposta útil está aqui.
 */
function TurnAudit({ steps }: { steps: TurnStep[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
      >
        <ChevronRight
          className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-90")}
        />
        {steps.length === 1 ? "1 ferramenta neste turno" : `${steps.length} ferramentas neste turno`}
      </button>

      {open && (
        <ol className="mt-2 space-y-2 border-l border-border pl-3">
          {steps.map((step, i) => (
            <li key={`${step.id}-${i}`} className="text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-text-secondary">
                <Wrench className="w-3 h-3 text-purple/70" />
                {step.name}
              </div>
              {step.arguments && (
                <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-alt px-2.5 py-1.5 text-[11px] leading-5 text-text-muted whitespace-pre-wrap break-all">
                  {step.arguments}
                </pre>
              )}
              <StepResult result={step.result} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StepResult({ result }: { result: string }) {
  if (!result) {
    return (
      <p className="mt-1 text-[11px] italic text-text-muted">
        Sem resultado gravado — o turno acabou antes desta ferramenta responder.
      </p>
    );
  }
  const cut = result.endsWith(TRUNCATION_MARK);
  return (
    <>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-surface px-2.5 py-1.5 text-[11px] leading-5 text-text-primary whitespace-pre-wrap break-words">
        {cut ? result.slice(0, -TRUNCATION_MARK.length) : result}
      </pre>
      {cut && (
        <p className="mt-0.5 text-[11px] italic text-text-muted">
          Resultado cortado ao gravar — o agente viu o restante.
        </p>
      )}
    </>
  );
}

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
        title={copied ? "Copiado" : "Copiar código"}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-purple-300" />
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
  a(props: React.ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
    const { node: _node, ...rest } = props;
    return <a {...rest} target="_blank" rel="noopener noreferrer" />;
  },
};

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolHint?: string;
  /** O que o agente já fez neste turno, em ordem. Some quando a resposta chega. */
  notes?: string[];
  /** O turno passou do teto e segue trabalhando com o chat liberado. */
  pending?: boolean;
  /** O que o agente fez para chegar nesta resposta, numa conversa recarregada. */
  steps?: TurnStep[];
}

export function ChatMessage({
  role, content, isStreaming, toolHint, notes, pending, steps,
}: Props) {
  const isUser = role === "user";
  const isThinking = isStreaming && !content;

  return (
    <div
      className={cn(
        "flex px-8 py-4",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div className={cn("flex max-w-[min(980px,78%)] gap-3", isUser && "flex-row-reverse")}>
        {/* Avatar */}
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
            isUser
              ? "bg-surface-alt border border-border"
              : "bg-purple-muted border border-purple/20",
          )}
        >
          {isUser ? (
            <User className="w-4 h-4 text-text-secondary" />
          ) : (
            <Bot className="w-4 h-4 text-purple" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className={cn("text-[11px] font-semibold text-text-muted mb-1.5 uppercase tracking-wide", isUser && "text-right")}>
            {isUser ? "Você" : "Sólides Agent"}
          </div>

          {!isUser && isStreaming && notes && notes.length > 0 && (
            <div className="mb-2 flex flex-col gap-1">
              {notes.map((note, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 text-xs leading-5 animate-fade-in",
                    i === notes.length - 1 ? "text-text-secondary" : "text-text-muted",
                  )}
                >
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-purple/60 shrink-0" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}

          {isUser ? (
            <div className="rounded-xl bg-purple px-5 py-3 text-sm font-medium leading-7 text-white shadow-sm whitespace-pre-wrap">
              {content}
            </div>
          ) : isThinking ? (
            <div className="flex items-center gap-3 py-2">
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-purple-muted border border-purple/20">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-purple"
                      style={{ animation: `typing-dot 1.2s ${i * 0.2}s ease-in-out infinite` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-purple-hover font-medium">
                  {pending ? "Trabalhando em segundo plano..." : "Pensando..."}
                </span>
              </div>
            </div>
          ) : (
            <div className="markdown-body rounded-xl bg-surface-alt px-5 py-4 text-sm leading-7 text-text-primary shadow-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-5 bg-purple ml-0.5 animate-pulse rounded-sm" />
              )}
            </div>
          )}

          {!isUser && steps && steps.length > 0 && <TurnAudit steps={steps} />}

          {/* Tool hint */}
          {isStreaming && (
            <div className="h-9 mt-2">
              {toolHint && (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-alt border border-border w-fit animate-fade-in">
                  <Wrench className="w-3.5 h-3.5 text-purple/70 animate-spin" />
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
