import type { ComponentType } from "react";
import {
  BookOpen,
  Brain,
  Clock,
  Code2,
  FileText,
  FolderOpen,
  Globe,
  MessageSquare,
  Monitor,
  MousePointer2,
  Pencil,
  Plug,
  Search,
  Sparkles,
  Terminal,
  Upload,
} from "lucide-react";

export type ToolDef = {
  id: string;
  name: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  warn?: string;
};

export type ToolCategory = {
  id: string;
  label: string;
  businessDesc: string;
  icon: ComponentType<{ className?: string }>;
  color: "violet" | "blue" | "amber" | "emerald" | "rose";
  tools: ToolDef[];
  recommended?: boolean;
  warn?: boolean;
};

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "memory",
    label: "Memória e Conhecimento",
    businessDesc: "Lembra de conversas e consulta documentos, FAQs e políticas internas.",
    icon: Brain,
    color: "violet",
    recommended: true,
    tools: [
      { id: "save_memory", name: "Salvar Memória", desc: "Registra informações para uso futuro", icon: Brain },
      { id: "search_memory", name: "Buscar Memória", desc: "Recupera contexto de conversas anteriores", icon: BookOpen },
      { id: "rag_search", name: "Consultar Base", desc: "Pesquisa FAQs e documentos", icon: Search },
      { id: "rag_ingest", name: "Aprender Documentos", desc: "Adiciona documentos à base", icon: Upload },
    ],
  },
  {
    id: "web",
    label: "Web e Pesquisa",
    businessDesc: "Busca informações atualizadas e lê artigos, legislações e conteúdo de URLs.",
    icon: Globe,
    color: "blue",
    tools: [
      { id: "web_search", name: "Pesquisa Web", desc: "Busca na internet", icon: Search },
      { id: "web_fetch", name: "Leitor de URL", desc: "Lê conteúdo de sites", icon: Globe },
    ],
  },
  {
    id: "automation",
    label: "Automações e Alertas",
    businessDesc: "Envia alertas proativos, cria rotinas periódicas e coordena outros agentes.",
    icon: Sparkles,
    color: "amber",
    tools: [
      { id: "message", name: "Mensagens Proativas", desc: "Envia mensagens sem ser acionado", icon: MessageSquare },
      { id: "cron", name: "Tarefas Agendadas", desc: "Relatórios e alertas periódicos", icon: Clock },
      { id: "save_skill", name: "Criador de Skills", desc: "Aprende novas rotinas", icon: Sparkles },
      { id: "save_mcp_server", name: "Conectar MCP", desc: "Cadastra APIs MCP para o agente", icon: Plug },
    ],
  },
  {
    id: "files",
    label: "Arquivos e Documentos",
    businessDesc: "Lê, cria e edita relatórios, planilhas e documentos internos.",
    icon: FolderOpen,
    color: "emerald",
    tools: [
      { id: "read_file", name: "Ler Arquivo", desc: "Lê arquivos do workspace", icon: Code2 },
      { id: "write_file", name: "Criar Arquivo", desc: "Cria documentos e relatórios", icon: FileText },
      { id: "edit_file", name: "Editar Arquivo", desc: "Modifica arquivos existentes", icon: Pencil },
      { id: "list_dir", name: "Listar Pasta", desc: "Navega diretórios", icon: FolderOpen },
    ],
  },
  {
    id: "system",
    label: "Sistema",
    businessDesc: "Executa comandos no terminal e controla o computador. Use com cautela.",
    icon: Terminal,
    color: "rose",
    warn: true,
    tools: [
      { id: "exec", name: "Terminal", desc: "Executa comandos no SO", icon: Terminal, warn: "Acesso total" },
      { id: "computer", name: "Computador", desc: "Interage com aplicações visuais", icon: MousePointer2 },
      { id: "browser", name: "Navegador", desc: "Controla o navegador", icon: Monitor },
    ],
  },
];

export const TOOL_COLOR = {
  violet: {
    activeIcon: "bg-violet-600 text-white",
    ring: "border-violet-300 ring-2 ring-violet-200",
    checkBg: "bg-violet-600",
    toolBg: "bg-violet-50 border-violet-200",
    count: "bg-violet-100 text-violet-700",
  },
  blue: {
    activeIcon: "bg-blue-600 text-white",
    ring: "border-blue-300 ring-2 ring-blue-200",
    checkBg: "bg-blue-600",
    toolBg: "bg-blue-50 border-blue-200",
    count: "bg-blue-100 text-blue-700",
  },
  amber: {
    activeIcon: "bg-amber-500 text-white",
    ring: "border-amber-300 ring-2 ring-amber-200",
    checkBg: "bg-amber-500",
    toolBg: "bg-amber-50 border-amber-200",
    count: "bg-amber-100 text-amber-700",
  },
  emerald: {
    activeIcon: "bg-emerald-600 text-white",
    ring: "border-emerald-300 ring-2 ring-emerald-200",
    checkBg: "bg-emerald-600",
    toolBg: "bg-emerald-50 border-emerald-200",
    count: "bg-emerald-100 text-emerald-700",
  },
  rose: {
    activeIcon: "bg-rose-600 text-white",
    ring: "border-rose-300 ring-2 ring-rose-200",
    checkBg: "bg-rose-600",
    toolBg: "bg-rose-50 border-rose-200",
    count: "bg-rose-100 text-rose-700",
  },
} as const;
