import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Agent, TraceEvent } from "@/lib/api";
import { ChatMessage } from "./ChatMessage";
import { ArrowLeft, Bot, Eye, Mic, MessageSquarePlus, Paperclip, Send, Sparkles, Terminal } from "lucide-react";
import { getIcon, ICON_CATALOG } from "@/lib/iconCatalog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const FALLBACK_COMMANDS = [
  "O que você consegue fazer?",
  "Quais integrações você tem ativas?",
];

export function ChatArea() {
  const {
    agents,
    systemAgents,
    activeAgentId,
    templates,
    loadTemplates,
    messages,
    sending,
    sendMessage,
    updateAgent,
    selectAgent,
    newChat,
    setTraceEnabled,
  } = useStore();
  const [input, setInput] = useState("");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (templates.length === 0) loadTemplates();
  }, [templates.length, loadTemplates]);

  const currentAgent =
    agents.find((agent) => agent.agent_id === activeAgentId) ??
    systemAgents.find((agent) => agent.agent_id === activeAgentId) ??
    agents[0] ?? { agent_id: "", name: "Paulo", role: "Especialista em DP", avatar: "P" };
  const isSystemAgent = systemAgents.some((a) => a.agent_id === activeAgentId);
  const templateId = (currentAgent as Agent).metadata?.template;
  const starters = templates.find((t) => t.id === templateId)?.starter_prompts ?? [];
  const quickCommands = starters.length > 0 ? starters : FALLBACK_COMMANDS;
  const lastMsg = messages[messages.length - 1];
  const needsThinkingBubble =
    sending && (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.isStreaming);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInput("");
  }

  return (
    <div className="flex h-full overflow-hidden bg-surface">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-border bg-surface px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-muted text-purple">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted leading-tight">
                Falar com
              </span>
              {isSystemAgent ? (
                <span className="text-sm font-semibold text-text-primary leading-tight">
                  {currentAgent.name}
                  {currentAgent.role ? ` · ${currentAgent.role}` : ""}
                </span>
              ) : (
                <Select
                  value={activeAgentId ?? ""}
                  onValueChange={(v) => selectAgent(v)}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[180px] text-sm font-semibold">
                    <SelectValue placeholder="Selecionar agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.agent_id} value={a.agent_id}>
                        {a.name}
                        {a.role ? ` · ${a.role}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSystemAgent && agents.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  selectAgent(
                    (agents.find((a) => a.is_default) ?? agents[0]).agent_id,
                  )
                }
                title="Voltar a conversar com seus agentes de trabalho"
              >
                <ArrowLeft />
                Voltar aos meus agentes
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => newChat()}
              title="Começar uma nova conversa (limpa o histórico atual)"
            >
              <MessageSquarePlus />
              Nova conversa
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = !terminalOpen;
                setTerminalOpen(next);
                setTraceEnabled(next);
              }}
            >
              <Terminal />
              {terminalOpen ? "Ocultar execução" : "Ver execução"}
            </Button>
          </div>
        </div>

        {(currentAgent as { status?: string }).status === "draft" && (
          <div className="flex items-center justify-between gap-3 border-b border-yellow/20 bg-yellow-muted px-6 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow text-white">
                <Eye className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-yellow leading-tight">
                  Preview em rascunho
                </p>
                <p className="text-[11px] font-medium text-text-secondary leading-tight">
                  Este agente ainda não foi ativado. Teste aqui e ative quando estiver pronto.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => activeAgentId && updateAgent(activeAgentId, { status: "active" })}
            >
              <Sparkles />
              Ativar agente
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="w-full space-y-4">
            {messages.length === 0 && !sending ? (
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-muted text-sm font-bold text-purple">
                  {(() => {
                    const isSlug =
                      currentAgent.avatar &&
                      ICON_CATALOG.some((i) => i.slug === currentAgent.avatar);
                    if (isSlug) {
                      const Icon = getIcon(currentAgent.avatar);
                      return <Icon className="w-4 h-4" />;
                    }
                    return (currentAgent.avatar || currentAgent.name[0] || "A").slice(0, 2);
                  })()}
                </div>
                <div className="max-w-[min(960px,78%)]">
                  <div className="rounded-2xl bg-surface-alt px-5 py-4 text-sm font-medium leading-7 text-text-primary shadow-sm">
                    Olá. Sou o {currentAgent.name},{" "}
                    {currentAgent.role || "agente configurado"}. Posso responder dúvidas com base
                    no RAG, consultar memória e acionar ferramentas habilitadas no backend.
                  </div>
                  <span className="ml-1 mt-1 block text-[11px] font-medium text-text-muted">
                    Agora
                  </span>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    isStreaming={msg.isStreaming}
                    toolHint={msg.toolHint}
                  />
                ))}
                {needsThinkingBubble && <ChatMessage role="assistant" content="" isStreaming />}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface-alt/60 px-8 py-5">
          <div className="w-full space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-text-muted">
                <Sparkles className="h-3.5 w-3.5 text-purple" />
                Comandos rápidos:
              </span>
              {quickCommands.map((command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => submit(command)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-sm hover:border-purple/40 hover:bg-purple-muted hover:text-purple-hover transition-colors"
                >
                  {command}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-4 py-1.5 shadow-sm focus-within:border-purple/40 focus-within:shadow-md transition-shadow">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit(input);
                }}
                placeholder={`Pergunte algo para ${currentAgent.name}...`}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-muted"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Anexar documento"
                className="rounded-full"
              >
                <Paperclip />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Gravar voz"
                className="rounded-full"
              >
                <Mic />
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={() => submit(input)}
                disabled={!input.trim() || sending}
                title="Enviar"
                className="rounded-full"
              >
                <Send />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {terminalOpen && (
        <TracePanel
          agentName={currentAgent.name}
          onClose={() => setTerminalOpen(false)}
        />
      )}
    </div>
  );
}

const TRACE_STYLE: Record<
  string,
  { label: string; color: string; summary: (e: TraceEvent) => string }
> = {
  turn: {
    label: "turno",
    color: "text-purple",
    summary: (e) =>
      `${e.model ?? "?"} · ${e.tools?.length ?? 0} tools · ${e.history_messages ?? 0} msgs de contexto`,
  },
  llm: {
    label: "modelo",
    color: "text-sky-300",
    summary: (e) => {
      const usage = e.usage
        ? ` · ${e.usage.prompt_tokens ?? 0}+${e.usage.completion_tokens ?? 0} tokens`
        : "";
      const calls = e.tool_calls?.length ? ` → ${e.tool_calls.join(", ")}` : "";
      return `iteração ${e.iteration ?? "?"}${usage}${calls}`;
    },
  },
  tool_call: {
    label: "chamada",
    color: "text-amber-300",
    summary: (e) => `${e.tool ?? "?"}(…)`,
  },
  tool_result: {
    label: "resultado",
    color: "text-emerald-300",
    summary: (e) => `${e.tool ?? "?"} → ${(e.result ?? "").length} chars`,
  },
  delegation: {
    label: "delegação",
    color: "text-fuchsia-300",
    summary: (e) => `${e.cli ?? "cli"} em ${e.branch ?? "?"} (teto ${e.timeout_s ?? "?"}s)`,
  },
  limit: {
    label: "teto",
    color: "text-red-400",
    summary: (e) => `${e.iterations ?? "?"} iterações sem concluir`,
  },
};

/** The fields worth reading in full, in the order a person debugs them. */
const TRACE_BLOCKS: { key: keyof TraceEvent; label: string }[] = [
  { key: "system_prompt", label: "system prompt" },
  { key: "user_message", label: "mensagem do usuário" },
  { key: "reasoning", label: "raciocínio" },
  { key: "content", label: "texto do modelo" },
  { key: "arguments", label: "argumentos" },
  { key: "result", label: "resultado" },
  { key: "prompt", label: "prompt enviado à CLI" },
];

function TraceEntry({ event, index }: { event: TraceEvent; index: number }) {
  const style = TRACE_STYLE[event.kind] ?? {
    label: event.kind,
    color: "text-slate-300",
    summary: () => "",
  };
  const blocks = TRACE_BLOCKS.filter((b) => {
    const value = event[b.key];
    return typeof value === "string" && value.trim().length > 0;
  });

  return (
    <div className="border-b border-slate-800 pb-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-slate-600">{String(index).padStart(3, "0")}</span>
        <span className={cn("font-bold", style.color)}>[{style.label}]</span>
        <span className="min-w-0 break-all text-slate-400">{style.summary(event)}</span>
      </div>
      {blocks.map((block) => (
        <details key={block.key} className="mt-1">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300">
            {block.label} ({(event[block.key] as string).length})
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-2 text-[10px] leading-relaxed text-slate-300">
            {event[block.key] as string}
          </pre>
        </details>
      ))}
    </div>
  );
}

function TracePanel({
  agentName,
  onClose,
}: {
  agentName: string;
  onClose: () => void;
}) {
  const trace = useStore((s) => s.trace);
  const clearTrace = useStore((s) => s.clearTrace);
  const sending = useStore((s) => s.sending);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (follow) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [trace.length, follow]);

  const turn = trace.find((e) => e.kind === "turn");

  return (
    <aside className="hidden w-[26rem] shrink-0 flex-col border-l border-border bg-slate-950 text-slate-300 lg:flex">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/80 p-3">
        <Terminal className="h-4 w-4 text-purple" />
        <span className="text-xs font-bold text-slate-100">Execução do agente</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFollow((v) => !v)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px]",
              follow ? "bg-purple/20 text-purple" : "text-slate-500 hover:text-slate-300",
            )}
            title="Rolar automaticamente"
          >
            auto
          </button>
          <button
            type="button"
            onClick={clearTrace}
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-300"
          >
            limpar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-300"
          >
            fechar
          </button>
        </div>
      </div>

      <details className="border-b border-slate-800 bg-slate-900">
        <summary className="cursor-pointer p-3 text-[10px] font-bold uppercase tracking-wider text-yellow">
          Ferramentas de {agentName}
          {turn?.tools?.length ? ` (${turn.tools.length})` : ""}
        </summary>
        <div className="max-h-32 overflow-y-auto px-3 pb-3">
          {turn?.tools?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {turn.tools.map((tool) => (
                <Badge key={tool} variant="code">
                  {tool}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-slate-500">
              Mande uma mensagem para ver as ferramentas que este agente carrega.
            </span>
          )}
        </div>
      </details>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px]">
        {trace.length === 0 ? (
          <p className="italic text-slate-600">
            Nada ainda. O que acontecer no próximo turno aparece aqui: o prompt
            montado, o raciocínio do modelo, cada chamada de ferramenta com seus
            argumentos e o que voltou.
          </p>
        ) : (
          <div className="space-y-2">
            {trace.map((event, i) => (
              <TraceEntry key={i} event={event} index={i + 1} />
            ))}
          </div>
        )}
        {sending && (
          <p className="mt-2 text-purple">[executando] …</p>
        )}
        <div ref={bottomRef} />
      </div>
    </aside>
  );
}
