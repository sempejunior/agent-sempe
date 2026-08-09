import { create } from "zustand";
import type {
  Agent,
  AgentTemplate,
  User,
  Session,
  Message,
  Question,
  NoticeKind,
  TraceEvent,
  WsIncoming,
} from "./api";
import {
  login as apiLogin,
  register as apiRegister,
  getMe,
  listSessions,
  getMessages,
  deleteSession as apiDeleteSession,
  createChatSocket,
  createAgent as apiCreateAgent,
  listAgents,
  setActiveAgentId,
  updateAgent as apiUpdateAgent,
  deleteAgent as apiDeleteAgent,
  duplicateAgent as apiDuplicateAgent,
  getAgentTemplates,
  listQuestions,
} from "./api";
import { toast } from "./toast";

export type View =
  | "chat"
  | "agents"
  | "agent-config"
  | "agent-create"
  | "agent-team"
  | "agent-store"
  | "agent-studio"
  | "capabilities"
  | "skills-catalog"
  | "api-connections"
  | "integrations"
  | "mcp"
  | "dbs"
  | "memory"
  | "prompts"
  | "channels"
  | "rag"
  | "rag-manager"
  | "cron"
  | "alerts"
  | "activity"
  | "settings"
  | "clients";

/** Uma ferramenta que o agente chamou, com o que voltou dela. */
export interface TurnStep {
  id: string;
  name: string;
  arguments: string;
  result: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** O que o agente fez para chegar nesta resposta. Só em conversa recarregada:
   *  no turno ao vivo o andamento aparece como notas. */
  steps?: TurnStep[];
  isStreaming?: boolean;
  toolHint?: string;
  /** Which turn produced this bubble. Two turns of the same socket run at the
   *  same time, so "the last streaming bubble" is not a safe target. */
  turnId?: string;
  /** Progress notes, in order. Ephemeral: they are not part of the history and
   *  do not survive a reload. */
  notes?: string[];
  /** The turn passed the soft ceiling and kept going in the background. */
  pending?: boolean;
}

/** An alert worth showing outside the chat, because the person may be elsewhere. */
export interface Notice {
  id: string;
  kind: NoticeKind;
  text: string;
  sessionKey: string | null;
}

interface WizardDraft {
  template_id: string | null;
  name: string;
  role: string;
  description: string;
  avatar: string;
  persona: string;
  guidelines: string;
  rag_enabled: boolean;
  tools: string[];
  skills: string[];
  mcps: string[];
  channels: string[];
  starter_prompts: string[];
}

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  authLoading: boolean;
  authError: string | null;

  // Sessions
  agents: Agent[];
  systemAgents: Agent[];
  activeAgentId: string | null;
  sessions: Session[];
  activeSessionKey: string | null;
  messages: ChatMessage[];
  loadingSessions: boolean;

  // Pendências — no store apenas porque o menu mostra a contagem
  openQuestions: Question[];

  notices: Notice[];

  // Templates + wizard
  templates: AgentTemplate[];
  wizardStep: WizardStep;
  wizardDraft: WizardDraft;

  // Chat
  ws: WebSocket | null;
  connected: boolean;
  sending: boolean;

  // Navigation
  sidebarOpen: boolean;
  activeView: View;
  selectedClientId: string | null;
  editingAgentId: string | null;

  // Actions
  initAuth: () => Promise<void>;
  login: (userId: string) => Promise<void>;
  register: (userId: string, displayName?: string, email?: string) => Promise<void>;
  logout: () => void;

  loadSessions: () => Promise<void>;
  loadOpenQuestions: () => Promise<void>;
  loadAgents: () => Promise<void>;
  selectAgent: (agentId: string) => Promise<void>;
  createAgent: (data: Partial<Agent>) => Promise<Agent | null>;
  updateAgent: (agentId: string, data: Partial<Agent>) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<boolean>;
  duplicateAgent: (agentId: string) => Promise<Agent | null>;
  selectSession: (key: string, agentId?: string) => Promise<void>;
  newChat: () => void;
  removeSession: (key: string) => Promise<void>;

  connectWs: () => void;
  disconnectWs: () => void;
  sendMessage: (content: string) => void;

  trace: TraceEvent[];
  traceEnabled: boolean;
  setTraceEnabled: (on: boolean) => void;
  clearTrace: () => void;

  toggleSidebar: () => void;
  setActiveView: (view: View) => void;
  setSelectedClientId: (id: string | null) => void;
  setEditingAgentId: (id: string | null) => void;

  loadTemplates: () => Promise<void>;
  setWizardStep: (step: WizardStep) => void;
  updateWizardDraft: (patch: Partial<WizardDraft>) => void;
  resetWizard: () => void;
}

const EMPTY_WIZARD: WizardDraft = {
  template_id: null,
  name: "",
  role: "",
  description: "",
  avatar: "",
  persona: "",
  guidelines: "",
  rag_enabled: false,
  tools: [],
  skills: [],
  mcps: [],
  channels: [],
  starter_prompts: [],
};

let msgCounter = 0;
function nextId(): string {
  return `msg_${Date.now()}_${++msgCounter}`;
}

/** Remonta a conversa gravada, prendendo a cada resposta o que o agente fez para chegar nela.
 *
 *  O banco guarda a sequência plana que o modelo viu: assistente pedindo
 *  ferramentas, resultados voltando, e por fim a resposta. Quem lê a conversa
 *  quer o contrário — a resposta, com o trabalho pendurado nela. Um turno que
 *  terminou sem texto (delegação disparada, teto estourado) ainda ganha um balão:
 *  o trabalho existiu e sumiria sem onde se pendurar.
 */
function replayConversation(msgs: Message[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let steps: TurnStep[] = [];

  for (const m of msgs) {
    if (m.role === "user") {
      out.push({ id: nextId(), role: "user", content: m.content });
      steps = [];
    } else if (m.role === "assistant" && m.tool_calls?.length) {
      steps.push(
        ...m.tool_calls.map((call) => ({
          id: call.id,
          name: call.function?.name || "ferramenta",
          arguments: call.function?.arguments || "",
          result: "",
        }))
      );
    } else if (m.role === "tool") {
      const step = steps.find((s) => s.id === m.tool_call_id) ?? steps[steps.length - 1];
      if (step) step.result = m.content;
    } else if (m.role === "assistant" && m.content.trim()) {
      out.push({
        id: nextId(),
        role: "assistant",
        content: m.content,
        ...(steps.length ? { steps } : {}),
      });
      steps = [];
    }
  }

  if (steps.length) {
    out.push({ id: nextId(), role: "assistant", content: "", steps });
  }
  return out;
}

let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<AppState>((set, get) => ({
  user: null,
  token: localStorage.getItem("nanobot_token"),
  authLoading: false,
  authError: null,

  agents: [],
  systemAgents: [],
  activeAgentId: localStorage.getItem("nanobot_agent_id"),
  sessions: [],
  activeSessionKey: null,
  messages: [],
  loadingSessions: false,

  ws: null,
  connected: false,
  sending: false,
  trace: [],
  traceEnabled: false,

  sidebarOpen: true,
  activeView: "agent-team",
  selectedClientId: null,
  editingAgentId: null,

  openQuestions: [],
  notices: [],

  templates: [],
  wizardStep: 1,
  wizardDraft: { ...EMPTY_WIZARD },

  // ---- Auth ----

  async initAuth() {
    const token = get().token;
    if (!token) return;
    set({ authLoading: true });
    try {
      const user = await getMe();
      set({ user, authLoading: false });
      await get().loadAgents();
      get().connectWs();
      get().loadSessions();
      get().loadOpenQuestions();
    } catch {
      localStorage.removeItem("nanobot_token");
      set({ token: null, user: null, authLoading: false });
    }
  },

  async login(userId: string) {
    set({ authLoading: true, authError: null });
    try {
      const res = await apiLogin(userId);
      localStorage.setItem("nanobot_token", res.token);
      set({ token: res.token, user: res.user, authLoading: false });
      await get().loadAgents();
      get().connectWs();
      get().loadSessions();
      get().loadOpenQuestions();
    } catch (e) {
      set({ authError: (e as Error).message, authLoading: false });
    }
  },

  async register(userId: string, displayName?: string, email?: string) {
    set({ authLoading: true, authError: null });
    try {
      const res = await apiRegister(userId, displayName, email);
      localStorage.setItem("nanobot_token", res.token);
      set({ token: res.token, user: res.user, authLoading: false });
      await get().loadAgents();
      get().connectWs();
      get().loadSessions();
      get().loadOpenQuestions();
    } catch (e) {
      set({ authError: (e as Error).message, authLoading: false });
    }
  },

  logout() {
    get().disconnectWs();
    localStorage.removeItem("nanobot_token");
    setActiveAgentId(null);
    set({
      user: null,
      token: null,
      sessions: [],
      agents: [],
      activeAgentId: null,
      activeSessionKey: null,
      messages: [],
      openQuestions: [],
      notices: [],
    });
  },

  // ---- Pendências ----

  async loadOpenQuestions() {
    try {
      set({ openQuestions: await listQuestions("open") });
    } catch {
      // Silencioso de propósito: é a contagem do menu, não o pedido de ninguém.
      // A página de pendências reporta o erro quando alguém abre ela.
    }
  },

  // ---- Sessions ----

  async loadAgents() {
    try {
      const all = await listAgents();
      const isSystem = (a: Agent) =>
        Boolean((a.metadata as { system?: boolean } | undefined)?.system) ||
        (a.metadata as { template?: string } | undefined)?.template === "skill_author";
      const systemAgents = all.filter(isSystem);
      const agents = all.filter((a) => !isSystem(a));
      const current = get().activeAgentId;
      // A system agent stays active if it is the one selected: reloading the list
      // (which updateAgent, deleteAgent and login all do) must not pull the user
      // out of a conversation with the Skill Author.
      const active = all.find((agent) => agent.agent_id === current)
        ?? agents.find((agent) => agent.is_default)
        ?? agents[0]
        ?? null;
      set({ agents, systemAgents, activeAgentId: active?.agent_id ?? null });
      setActiveAgentId(active?.agent_id ?? null);
    } catch (e) {
      toast("error", `Failed to load agents: ${(e as Error).message}`);
    }
  },

  async selectAgent(agentId: string) {
    setActiveAgentId(agentId);
    set({ activeAgentId: agentId, activeSessionKey: null, messages: [] });
    await get().loadSessions();
  },

  async createAgent(data: Partial<Agent>) {
    try {
      const agent = await apiCreateAgent(data);
      await get().loadAgents();
      await get().selectAgent(agent.agent_id);
      return agent;
    } catch (e) {
      toast("error", `Failed to create agent: ${(e as Error).message}`);
      return null;
    }
  },

  async updateAgent(agentId: string, data: Partial<Agent>) {
    try {
      await apiUpdateAgent(agentId, data);
      await get().loadAgents();
    } catch (e) {
      toast("error", `Failed to update agent: ${(e as Error).message}`);
    }
  },

  async deleteAgent(agentId: string) {
    try {
      const res = await apiDeleteAgent(agentId);
      if (!res.ok) {
        toast("error", "Não foi possível excluir este agente");
        return false;
      }
      const wasActive = get().activeAgentId === agentId;
      await get().loadAgents();
      if (wasActive) {
        const fallback = get().agents.find((a) => a.is_default) ?? get().agents[0];
        if (fallback) await get().selectAgent(fallback.agent_id);
      }
      toast("success", "Agente excluído");
      return true;
    } catch (e) {
      toast("error", `Falha ao excluir agente: ${(e as Error).message}`);
      return false;
    }
  },

  async duplicateAgent(agentId: string) {
    try {
      const agent = await apiDuplicateAgent(agentId);
      await get().loadAgents();
      toast("success", `Agente duplicado: ${agent.name}`);
      return agent;
    } catch (e) {
      toast("error", `Falha ao duplicar agente: ${(e as Error).message}`);
      return null;
    }
  },

  async loadSessions() {
    set({ loadingSessions: true });
    try {
      const sessions = await listSessions();
      set({ sessions, loadingSessions: false });
    } catch (e) {
      set({ loadingSessions: false });
      toast("error", `Failed to load sessions: ${(e as Error).message}`);
    }
  },

  /** Abre uma conversa gravada.
   *
   *  Troca de agente quando a conversa é de outro: a busca é escopada por
   *  agente, e sem trocar a tela abriria vazia. Devolve o campo de digitação
   *  porque o turno que estava rodando é de outra conversa, e descarta uma
   *  resposta lenta de conversa já abandonada em vez de deixá-la sobrescrever a
   *  que está sendo lida.
   */
  async selectSession(key: string, agentId?: string) {
    if (agentId && agentId !== get().activeAgentId) {
      setActiveAgentId(agentId);
      set({ activeAgentId: agentId });
      get().loadSessions();
    }
    set({ activeSessionKey: key, messages: [], activeView: "chat", sending: false });
    try {
      const msgs = await getMessages(key);
      if (get().activeSessionKey !== key) return;
      set({ messages: replayConversation(msgs) });
    } catch (e) {
      toast("error", `Failed to load messages: ${(e as Error).message}`);
    }
  },

  newChat() {
    set({ activeSessionKey: null, messages: [], activeView: "chat", sending: false });
  },

  async removeSession(key: string) {
    await apiDeleteSession(key);
    const { sessions, activeSessionKey } = get();
    set({
      sessions: sessions.filter((s) => s.session_key !== key),
      ...(activeSessionKey === key ? { activeSessionKey: null, messages: [] } : {}),
    });
  },

  // ---- WebSocket ----

  connectWs() {
    const { token, ws: existingWs } = get();
    if (!token) return;

    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }

    if (existingWs) {
      existingWs.onclose = null;
      existingWs.onerror = null;
      existingWs.onmessage = null;
      existingWs.close();
    }

    const ws = createChatSocket(token);

    ws.onopen = () => {
      set({ connected: true });
      const activeKey = get().activeSessionKey;
      if (activeKey) {
        getMessages(activeKey)
          .then((msgs) =>
            set({
              messages: msgs.map((m: Message) => ({
                id: nextId(),
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
              sending: false,
            }),
          )
          .catch(() => {});
      }
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        } else {
          clearInterval(interval);
        }
      }, 30000);
    };

    /** Acha o balão do turno pelo turn_id, criando um quando ainda não existe.
     *
     *  Casar por "o último balão que está escrevendo" erra: dois turnos do mesmo
     *  socket rodam ao mesmo tempo, e um resultado de segundo plano chega sem
     *  turno nenhum.
     */
    const patchTurn = (turnId: string, patch: (m: ChatMessage) => ChatMessage) => {
      const msgs = get().messages;
      if (msgs.some((m) => m.turnId === turnId)) {
        set({ messages: msgs.map((m) => (m.turnId === turnId ? patch(m) : m)) });
        return;
      }
      const fresh: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: "",
        isStreaming: true,
        turnId,
      };
      set({ messages: [...msgs, patch(fresh)] });
    };

    /** Levanta um aviso: o menu mostra a contagem e o toast avisa na hora. */
    const raiseNotice = (kind: NoticeKind, text: string, sessionKey?: string) => {
      if (!text) return;
      set({
        notices: [
          ...get().notices,
          { id: nextId(), kind, text, sessionKey: sessionKey ?? null },
        ].slice(-20),
      });
      toast(kind === "question" ? "info" : "success", text);
    };

    ws.onmessage = (evt) => {
      const data: WsIncoming = JSON.parse(evt.data);
      const { messages } = get();

      if (data.type === "progress") {
        if (!data.turn_id || !data.content) return;
        patchTurn(data.turn_id, (m) => ({
          ...m,
          notes: [...(m.notes || []), data.content as string],
        }));
      } else if (data.type === "tool_hint") {
        if (!data.turn_id) return;
        patchTurn(data.turn_id, (m) => ({ ...m, toolHint: data.content || "" }));
      } else if (data.type === "handoff") {
        if (!data.turn_id) return;
        patchTurn(data.turn_id, (m) => ({
          ...m,
          pending: true,
          notes: [...(m.notes || []), data.content || ""],
        }));
        set({ sending: false });
        raiseNotice("done", data.content || "", data.session_key);
      } else if (data.type === "notice") {
        raiseNotice((data.kind as NoticeKind) || "done", data.content || "", data.session_key);
        if (data.kind === "question") get().loadOpenQuestions();
      } else if (data.type === "response") {
        if (get().traceEnabled) {
          set({
            trace: [
              ...get().trace,
              { kind: "answer", content: data.content || "" } as TraceEvent,
            ].slice(-400),
          });
        }
        if (data.turn_id) {
          patchTurn(data.turn_id, (m) => ({
            ...m,
            content: data.content || "",
            isStreaming: false,
            pending: false,
            toolHint: undefined,
          }));
          set({
            sending: false,
            activeSessionKey: data.session_key || get().activeSessionKey,
          });
        } else if (!data.session_key || data.session_key === get().activeSessionKey) {
          set({
            messages: [
              ...get().messages,
              { id: nextId(), role: "assistant", content: data.content || "" },
            ],
          });
        }
        get().loadSessions();
        // Um turno pode ter aberto ou fechado uma pendência — inclusive um turno
        // que ninguém pediu, vindo de uma tarefa de fundo ou de uma resposta.
        get().loadOpenQuestions();
      } else if (data.type === "trace") {
        const { type: _type, session_key: _key, ...event } = data;
        if (event.kind === "turn") {
          // The loop reports the last user-role message it assembled, which is the
          // runtime-context block, not what the person typed. The client knows the
          // real question, so it labels the turn with it.
          const asked = [...messages].reverse().find((m) => m.role === "user");
          event.user_message = asked?.content ?? event.user_message;
        }
        // Cap the buffer: a long turn emits hundreds of events, each carrying a
        // prompt or a tool result, and the panel only ever shows the recent tail.
        set({ trace: [...get().trace, event as TraceEvent].slice(-400) });
      } else if (data.type === "error") {
        if (data.turn_id) {
          patchTurn(data.turn_id, (m) => ({
            ...m,
            content: `Error: ${data.content}`,
            isStreaming: false,
            pending: false,
            toolHint: undefined,
          }));
        } else {
          set({
            messages: [
              ...get().messages,
              { id: nextId(), role: "assistant", content: `Error: ${data.content}` },
            ],
          });
        }
        set({ sending: false });
      }
    };

    ws.onclose = () => {
      set({ connected: false, sending: false });
      if (_reconnectTimer) {
        clearTimeout(_reconnectTimer);
      }
      _reconnectTimer = setTimeout(() => {
        _reconnectTimer = null;
        if (get().token) get().connectWs();
      }, 3000);
    };

    set({ ws });
  },

  disconnectWs() {
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
    const { ws } = get();
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      set({ ws: null, connected: false });
    }
  },

  sendMessage(content: string) {
    const { ws, activeSessionKey, messages, activeAgentId, sending } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (sending) return;

    const sessionKey = activeSessionKey || `web:${crypto.randomUUID().slice(0, 12)}`;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      content,
    };

    const { traceEnabled } = get();
    set({
      messages: [...messages, userMsg],
      sending: true,
      activeSessionKey: sessionKey,
    });

    ws.send(
      JSON.stringify({
        type: "message",
        content,
        session_key: sessionKey,
        agent_id: activeAgentId,
        trace: traceEnabled,
      })
    );
  },

  setTraceEnabled(on: boolean) {
    set({ traceEnabled: on });
  },

  clearTrace() {
    set({ trace: [] });
  },

  toggleSidebar() {
    set({ sidebarOpen: !get().sidebarOpen });
  },

  /** Abrir o chat também limpa os avisos: o que eles anunciam está lá dentro. */
  setActiveView(view: View) {
    set({ activeView: view, ...(view === "chat" ? { notices: [] } : {}) });
  },

  setSelectedClientId(id: string | null) {
    set({ selectedClientId: id, activeView: "clients" });
  },

  setEditingAgentId(id: string | null) {
    set({ editingAgentId: id });
  },

  async loadTemplates() {
    try {
      const templates = await getAgentTemplates();
      set({ templates });
    } catch (e) {
      toast("error", `Falha ao carregar templates: ${(e as Error).message}`);
    }
  },

  setWizardStep(step) {
    set({ wizardStep: step });
  },

  updateWizardDraft(patch) {
    set({ wizardDraft: { ...get().wizardDraft, ...patch } });
  },

  resetWizard() {
    set({ wizardStep: 1, wizardDraft: { ...EMPTY_WIZARD } });
  },
}));
