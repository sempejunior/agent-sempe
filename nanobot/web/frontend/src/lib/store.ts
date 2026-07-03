import { create } from "zustand";
import type { Agent, AgentTemplate, User, Session, Message, WsIncoming } from "./api";
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
  | "mcp"
  | "dbs"
  | "memory"
  | "prompts"
  | "channels"
  | "rag"
  | "rag-manager"
  | "cron"
  | "alerts"
  | "settings"
  | "clients";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolHint?: string;
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
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  authLoading: boolean;
  authError: string | null;

  // Sessions
  agents: Agent[];
  activeAgentId: string | null;
  sessions: Session[];
  activeSessionKey: string | null;
  messages: ChatMessage[];
  loadingSessions: boolean;

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
  loadAgents: () => Promise<void>;
  selectAgent: (agentId: string) => Promise<void>;
  createAgent: (data: Partial<Agent>) => Promise<Agent | null>;
  updateAgent: (agentId: string, data: Partial<Agent>) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<boolean>;
  duplicateAgent: (agentId: string) => Promise<Agent | null>;
  selectSession: (key: string) => Promise<void>;
  newChat: () => void;
  removeSession: (key: string) => Promise<void>;

  connectWs: () => void;
  disconnectWs: () => void;
  sendMessage: (content: string) => void;

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
};

let msgCounter = 0;
function nextId(): string {
  return `msg_${Date.now()}_${++msgCounter}`;
}

let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<AppState>((set, get) => ({
  user: null,
  token: localStorage.getItem("nanobot_token"),
  authLoading: false,
  authError: null,

  agents: [],
  activeAgentId: localStorage.getItem("nanobot_agent_id"),
  sessions: [],
  activeSessionKey: null,
  messages: [],
  loadingSessions: false,

  ws: null,
  connected: false,
  sending: false,

  sidebarOpen: true,
  activeView: "agent-team",
  selectedClientId: null,
  editingAgentId: null,

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
    });
  },

  // ---- Sessions ----

  async loadAgents() {
    try {
      const agents = await listAgents();
      const current = get().activeAgentId;
      const active = agents.find((agent) => agent.agent_id === current)
        ?? agents.find((agent) => agent.is_default)
        ?? agents[0]
        ?? null;
      set({ agents, activeAgentId: active?.agent_id ?? null });
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

  async selectSession(key: string) {
    set({ activeSessionKey: key, messages: [], activeView: "chat" });
    try {
      const msgs = await getMessages(key);
      const chatMsgs: ChatMessage[] = msgs.map((m: Message) => ({
        id: nextId(),
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      set({ messages: chatMsgs });
    } catch (e) {
      toast("error", `Failed to load messages: ${(e as Error).message}`);
    }
  },

  newChat() {
    set({ activeSessionKey: null, messages: [], activeView: "chat" });
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
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        } else {
          clearInterval(interval);
        }
      }, 30000);
    };

    ws.onmessage = (evt) => {
      const data: WsIncoming = JSON.parse(evt.data);
      const { messages } = get();

      if (data.type === "progress") {
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant" && last.isStreaming) {
          set({
            messages: messages.map((m) =>
              m.id === last.id ? { ...m, content: data.content || "" } : m
            ),
          });
        } else {
          set({
            messages: [
              ...messages,
              {
                id: nextId(),
                role: "assistant",
                content: data.content || "",
                isStreaming: true,
              },
            ],
          });
        }
      } else if (data.type === "tool_hint") {
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant" && last.isStreaming) {
          set({
            messages: messages.map((m) =>
              m.id === last.id ? { ...m, toolHint: data.content || "" } : m
            ),
          });
        }
      } else if (data.type === "response") {
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant" && last.isStreaming) {
          set({
            messages: messages.map((m) =>
              m.id === last.id
                ? { ...m, content: data.content || "", isStreaming: false, toolHint: undefined }
                : m
            ),
            sending: false,
            activeSessionKey: data.session_key || get().activeSessionKey,
          });
        } else {
          set({
            messages: [
              ...messages,
              { id: nextId(), role: "assistant", content: data.content || "" },
            ],
            sending: false,
            activeSessionKey: data.session_key || get().activeSessionKey,
          });
        }
        get().loadSessions();
      } else if (data.type === "error") {
        set({
          messages: [
            ...messages,
            { id: nextId(), role: "assistant", content: `Error: ${data.content}` },
          ],
          sending: false,
        });
      }
    };

    ws.onclose = () => {
      set({ connected: false });
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
    const { ws, activeSessionKey, messages, activeAgentId } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const sessionKey = activeSessionKey || `web:${crypto.randomUUID().slice(0, 12)}`;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      content,
    };

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
      })
    );
  },

  toggleSidebar() {
    set({ sidebarOpen: !get().sidebarOpen });
  },

  setActiveView(view: View) {
    set({ activeView: view });
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
