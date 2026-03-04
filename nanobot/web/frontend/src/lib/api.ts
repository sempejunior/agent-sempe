const API_BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("nanobot_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// Auth
export interface User {
  user_id: string;
  display_name: string;
  email: string | null;
  status: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export async function register(user_id: string, display_name?: string, email?: string): Promise<AuthResponse> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ user_id, display_name, email }),
  });
}

export async function login(user_id: string): Promise<AuthResponse> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ user_id }),
  });
}

export async function getMe(): Promise<User> {
  return request("/me");
}

// Sessions
export interface Session {
  session_key: string;
  title: string;
  message_count: number;
  updated_at: string;
}

export interface Message {
  role: string;
  content: string;
}

export async function listSessions(): Promise<Session[]> {
  return request("/sessions");
}

export async function getMessages(sessionKey: string): Promise<Message[]> {
  return request(`/sessions/${encodeURIComponent(sessionKey)}/messages`);
}

export async function deleteSession(sessionKey: string): Promise<{ ok: boolean }> {
  return request(`/sessions/${encodeURIComponent(sessionKey)}`, { method: "DELETE" });
}

// Cron
export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule_kind: string;
  schedule_expr: string;
  message: string;
  deliver?: boolean;
  channel?: string | null;
  to?: string | null;
  tz?: string | null;
}

export async function listCronJobs(): Promise<CronJob[]> {
  return request("/cron");
}

export async function addCronJob(data: {
  name: string;
  message: string;
  kind: string;
  every_seconds?: number;
  expr?: string;
  tz?: string;
  deliver?: boolean;
  channel?: string | null;
  to?: string | null;
}): Promise<{ id: string; name: string }> {
  return request("/cron", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteCronJob(jobId: string): Promise<{ ok: boolean }> {
  return request(`/cron/${jobId}`, { method: "DELETE" });
}

export async function enableCronJob(jobId: string, enabled: boolean): Promise<{ ok: boolean, enabled: boolean }> {
  return request(`/cron/${jobId}/enable`, { method: "PUT", body: JSON.stringify({ enabled }) });
}

export async function runCronJob(jobId: string): Promise<{ ok: boolean }> {
  return request(`/cron/${jobId}/run`, { method: "POST" });
}

// Config
export interface AgentConfig {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  max_tool_iterations?: number;
  memory_window?: number;
  language?: string;
  custom_instructions?: string;
  reasoning_effort?: string;
  web_proxy?: string;
  path_append?: string;
}

export async function getConfig(): Promise<AgentConfig> {
  return request("/config");
}

export async function updateConfig(data: Partial<AgentConfig>): Promise<{ ok: boolean; agent_config: AgentConfig }> {
  return request("/config", { method: "PUT", body: JSON.stringify(data) });
}

// Provider
export interface ProviderConfig {
  name: string;      // "openai" | "anthropic" | "custom" | ""
  api_key: string;   // masked on GET
  api_base: string;
}

export async function getProviderConfig(): Promise<ProviderConfig> {
  return request("/config/provider");
}

export async function updateProviderConfig(data: ProviderConfig): Promise<{ ok: boolean }> {
  return request("/config/provider", { method: "PUT", body: JSON.stringify(data) });
}

// Skills
export interface SkillsData {
  tools_enabled: string[];
}

export async function getSkills(): Promise<SkillsData> {
  return request("/skills");
}

export async function updateSkills(tools_enabled: string[]): Promise<{ ok: boolean; tools_enabled: string[] }> {
  return request("/skills", { method: "PUT", body: JSON.stringify({ tools_enabled }) });
}

export interface BuiltinSkill {
  name: string;
  description: string;
  available: boolean;
  always: boolean;
  content: string;
}

export async function getBuiltinSkills(): Promise<BuiltinSkill[]> {
  return request("/skills/builtin");
}

export interface CustomSkill {
  name: string;
  description: string;
  content: string;
  always_active: number;
  enabled: number;
}

// MCP Configuration
export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  tool_timeout?: number;
}

export interface MCPData {
  mcpServers: Record<string, MCPServerConfig>;
}

export async function getMcpConfig(): Promise<MCPData> {
  return request("/config/mcp");
}

export async function updateMcpConfig(data: MCPData): Promise<{ ok: boolean }> {
  return request("/config/mcp", { method: "PUT", body: JSON.stringify(data) });
}

export async function getCustomSkills(): Promise<CustomSkill[]> {
  return request("/skills/custom");
}

export async function deleteCustomSkill(name: string): Promise<void> {
  return request(`/skills/custom/${name}`, { method: "DELETE" });
}

export async function updateCustomSkill(name: string, data: {
  content?: string;
  description?: string;
  always_active?: number;
  enabled?: number;
}): Promise<{ ok: boolean }> {
  return request(`/skills/custom/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// Memory
export interface MemoryHistoryEntry {
  id: number;
  content: string;
  created_at: string;
}

export interface MemoryData {
  long_term: string;
  history: MemoryHistoryEntry[];
}

export async function getMemory(): Promise<MemoryData> {
  return request("/memory");
}

export async function updateLongTermMemory(content: string): Promise<{ ok: boolean }> {
  return request("/memory/long_term", { method: "PUT", body: JSON.stringify({ content }) });
}

export async function clearMemoryHistory(): Promise<{ ok: boolean; deleted: number }> {
  return request("/memory", { method: "DELETE" });
}

export async function deleteMemoryHistoryEntry(entryId: number): Promise<{ ok: boolean }> {
  return request(`/memory/${entryId}`, { method: "DELETE" });
}

// Memory search
export interface MemorySearchResult {
  id: number;
  content: string;
  created_at: string;
  relevance?: number;
}

export async function searchMemory(query: string): Promise<{ results: MemorySearchResult[] }> {
  return request(`/memory/search?q=${encodeURIComponent(query)}`);
}

// Prompts
export interface PromptSection {
  filename: string;
  label: string;
  description: string;
  hint: string;
  base: string;
  extension: string;
}

export async function getPrompts(): Promise<PromptSection[]> {
  return request("/config/prompts");
}

export async function updatePrompts(prompts: { filename: string; extension: string }[]): Promise<{ ok: boolean }> {
  return request("/config/prompts", { method: "PUT", body: JSON.stringify(prompts) });
}

// Channels
export interface ChannelField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "bool" | "list";
  required: boolean;
  placeholder?: string;
  help?: string;
}

export interface ChannelInfo {
  name: string;
  label: string;
  description: string;
  docs_url?: string;
  fields: ChannelField[];
  enabled: boolean;
  running: boolean;
  config: Record<string, unknown>;
}

export async function listChannels(): Promise<ChannelInfo[]> {
  return request("/channels");
}

export async function updateChannel(name: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
  return request(`/channels/${name}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function startChannel(name: string): Promise<{ ok: boolean; message: string }> {
  return request(`/channels/${name}/start`, { method: "POST" });
}

export async function stopChannel(name: string): Promise<{ ok: boolean; message: string }> {
  return request(`/channels/${name}/stop`, { method: "POST" });
}

// RAG
export interface RAGBackendConfig {
  type: string;
  api_url: string;
  api_key: string;
  headers: Record<string, string>;
  collection: string;
  search_path: string;
  ingest_path: string;
  delete_path: string;
  timeout: number;
}

export interface RAGConfig {
  enabled: boolean;
  default_backend: string;
  backends: Record<string, RAGBackendConfig>;
}

export async function getRagConfig(): Promise<RAGConfig> {
  return request("/config/rag");
}

export async function updateRagConfig(data: RAGConfig): Promise<{ ok: boolean }> {
  return request("/config/rag", { method: "PUT", body: JSON.stringify(data) });
}

// Clients
export interface Client {
  client_id: string;
  display_name: string;
  status: string;
  channels: string[];
  first_seen: string;
  last_seen: string;
  total_interactions: number;
  metadata?: string;
  owner_id?: string;
}

export interface ClientIdentity {
  id: number;
  client_id: string;
  channel: string;
  external_id: string;
  display_name: string;
  verified: number;
  created_at: string;
}

export interface ClientDetail extends Client {
  identities: ClientIdentity[];
}

export interface ClientMemoryData {
  long_term: string;
  history: { id: number; content: string; created_at: string }[];
}

export interface ClientSession {
  session_key: string;
  message_count: number;
  updated_at: string;
}

export async function listClients(params?: {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
  sort?: string;
}): Promise<{ clients: Client[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.sort) qs.set("sort", params.sort);
  const query = qs.toString();
  return request(`/clients${query ? `?${query}` : ""}`);
}

export async function getClient(clientId: string): Promise<ClientDetail> {
  return request(`/clients/${encodeURIComponent(clientId)}`);
}

export async function updateClient(
  clientId: string,
  data: { display_name?: string; metadata?: string; status?: string },
): Promise<{ ok: boolean }> {
  return request(`/clients/${encodeURIComponent(clientId)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteClient(clientId: string): Promise<{ ok: boolean }> {
  return request(`/clients/${encodeURIComponent(clientId)}`, { method: "DELETE" });
}

export async function addClientIdentity(
  clientId: string,
  data: { channel: string; external_id: string; display_name?: string },
): Promise<{ ok: boolean; id: number }> {
  return request(`/clients/${encodeURIComponent(clientId)}/identities`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteClientIdentity(
  clientId: string,
  identityId: number,
): Promise<{ ok: boolean }> {
  return request(`/clients/${encodeURIComponent(clientId)}/identities/${identityId}`, {
    method: "DELETE",
  });
}

export async function getClientMemory(clientId: string): Promise<ClientMemoryData> {
  return request(`/clients/${encodeURIComponent(clientId)}/memory`);
}

export async function updateClientLongTermMemory(
  clientId: string,
  content: string,
): Promise<{ ok: boolean }> {
  return request(`/clients/${encodeURIComponent(clientId)}/memory/long_term`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function clearClientMemory(
  clientId: string,
): Promise<{ ok: boolean; deleted: number }> {
  return request(`/clients/${encodeURIComponent(clientId)}/memory`, { method: "DELETE" });
}

export async function deleteClientMemoryEntry(
  clientId: string,
  entryId: number,
): Promise<{ ok: boolean }> {
  return request(`/clients/${encodeURIComponent(clientId)}/memory/${entryId}`, {
    method: "DELETE",
  });
}

export async function searchClientMemory(
  clientId: string,
  query: string,
): Promise<{ results: { id: number; content: string; created_at: string }[] }> {
  const cid = encodeURIComponent(clientId);
  return request(`/clients/${cid}/memory/search?q=${encodeURIComponent(query)}`);
}

export interface RecentMessage {
  role: string;
  content: string;
  timestamp: string;
  session_key: string;
}

export async function getClientRecentMessages(clientId: string, limit = 50): Promise<RecentMessage[]> {
  const cid = encodeURIComponent(clientId);
  return request(`/clients/${cid}/recent-messages?limit=${limit}`);
}

export async function listClientSessions(clientId: string): Promise<ClientSession[]> {
  return request(`/clients/${encodeURIComponent(clientId)}/sessions`);
}

export async function deleteClientSession(
  clientId: string,
  sessionKey: string,
): Promise<{ ok: boolean }> {
  const cid = encodeURIComponent(clientId);
  return request(`/clients/${cid}/sessions/${encodeURIComponent(sessionKey)}`, {
    method: "DELETE",
  });
}

export async function getClientSessionMessages(
  clientId: string,
  sessionKey: string,
): Promise<Message[]> {
  const cid = encodeURIComponent(clientId);
  return request(`/clients/${cid}/sessions/${encodeURIComponent(sessionKey)}/messages`);
}

export async function mergeClients(
  primaryId: string,
  secondaryId: string,
): Promise<{ ok: boolean; client_id: string }> {
  return request("/clients/merge", {
    method: "POST",
    body: JSON.stringify({ primary: primaryId, secondary: secondaryId }),
  });
}

export async function countActiveClients(): Promise<number> {
  const res = await listClients({ status: "active", limit: 0 });
  return res.total;
}

// WebSocket
export type WsMessageType = "response" | "progress" | "tool_hint" | "error" | "pong";

export interface WsIncoming {
  type: WsMessageType;
  content?: string;
  session_key?: string;
}

export function createChatSocket(token: string): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return new WebSocket(`${protocol}//${host}/ws/chat?token=${encodeURIComponent(token)}`);
}
