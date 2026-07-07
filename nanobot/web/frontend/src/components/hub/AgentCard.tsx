import { createElement } from "react";
import {
  Bot,
  Briefcase,
  FileText,
  HeartHandshake,
  MoreVertical,
  MessageSquare,
  Radio,
  Copy,
  Trash2,
  Zap,
  Pencil,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Agent, AgentMetrics } from "@/lib/api";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const AVATAR_TONES = [
  "bg-gradient-to-br from-purple-500 to-purple-700",
  "bg-gradient-to-br from-sky-500 to-indigo-600",
  "bg-gradient-to-br from-emerald-500 to-teal-600",
  "bg-gradient-to-br from-amber-500 to-orange-600",
  "bg-gradient-to-br from-rose-500 to-pink-600",
];

function avatarTone(id: string): string {
  const sum = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

function agentIcon(agent: Agent): LucideIcon {
  const role = (agent.role || "").toLowerCase();
  if (role.includes("recrut") || role.includes("seleção")) return Briefcase;
  if (role.includes("dp") || role.includes("pessoal") || role.includes("trabalhista")) return FileText;
  if (role.includes("clima") || role.includes("pdi") || role.includes("endomark")) return HeartHandshake;
  return Bot;
}

interface Props {
  agent: Agent;
  metrics?: AgentMetrics;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onAdvanced: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}

export function AgentCard({
  agent,
  metrics,
  isActive,
  onSelect,
  onEdit,
  onAdvanced,
  onDuplicate,
  onDelete,
  onToggleStatus,
}: Props) {
  const tone = avatarTone(agent.agent_id);
  const enabled = agent.status === "active" || agent.is_default;
  const ragEnabled = Boolean(
    (agent.agent_config as { rag?: { enabled?: boolean } } | undefined)?.rag?.enabled,
  );
  const channelCount = Object.values(agent.channel_configs ?? {}).filter(
    (cfg) => (cfg as { enabled?: boolean } | undefined)?.enabled,
  ).length;
  const tools = agent.tools_enabled ?? [];
  const visibleTools = tools.slice(0, 3);
  const extraTools = tools.length - visibleTools.length;

  return (
    <Card
      onClick={onSelect}
      onDoubleClick={onEdit}
      className={[
        "relative flex flex-col cursor-pointer group h-full transition-all",
        "hover:border-purple/40 hover:shadow-md",
        isActive ? "border-purple/50 shadow-md" : "",
        !enabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <CardContent className="p-6 pt-6 flex-1">
        <div className="flex items-start gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg text-white ${tone}`}
          >
            {createElement(agentIcon(agent), { className: "w-6 h-6" })}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-[17px] text-text-primary leading-tight truncate flex items-center gap-2">
              <span className="truncate">{agent.name}</span>
              {enabled && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
            </h3>
            <p className="text-[13px] font-semibold text-purple-hover mt-1 truncate">
              {agent.role}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge variant="outline" className="uppercase tracking-wide">
                Sólides Nativo
              </Badge>
              {agent.status === "draft" && (
                <Badge variant="warning" className="uppercase">
                  Rascunho
                </Badge>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-6 text-text-secondary line-clamp-2 min-h-[3rem]">
          {agent.description || "Agente configurado — clique duas vezes para editar."}
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {ragEnabled && <Badge variant="success">RAG ativa</Badge>}
          {channelCount > 0 && (
            <Badge variant="outline" className="gap-1">
              <MessageSquare className="w-3 h-3" />
              {channelCount} canal{channelCount > 1 ? "is" : ""}
            </Badge>
          )}
          {visibleTools.map((t) => (
            <Badge key={t} variant="code" className="gap-1 max-w-[140px]">
              <Zap className="w-3 h-3 text-purple shrink-0" />
              <span className="truncate">{t}</span>
            </Badge>
          ))}
          {extraTools > 0 && <Badge variant="default">+{extraTools}</Badge>}
        </div>

        {metrics && (
          <>
            <Separator className="mt-4" />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-text-primary">{metrics.messages_last_24h}</div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider">msgs/24h</div>
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-text-primary">{metrics.active_channels}</div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider">canais</div>
              </div>
              <div className="flex items-center justify-center">
                <Radio
                  className={`w-4 h-4 ${enabled ? "text-emerald-500 animate-pulse" : "text-text-muted"}`}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Separator />

      <CardFooter className="px-6 py-3">
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={enabled}
            disabled={agent.is_default}
            onCheckedChange={() => {
              if (!agent.is_default) onToggleStatus();
            }}
            aria-label={agent.is_default ? "Agente padrão — sempre ativo" : enabled ? "Desativar" : "Ativar"}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => e.stopPropagation()}
              title="Ações"
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Editar no Estúdio
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAdvanced}>
              <Settings /> Configurações avançadas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> Duplicar
            </DropdownMenuItem>
            {!agent.is_default && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="danger" onSelect={onDelete}>
                  <Trash2 /> Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
