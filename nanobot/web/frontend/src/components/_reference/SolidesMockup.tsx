// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Bot, 
  Store, 
  Settings, 
  Users, 
  Plus, 
  Paperclip, 
  Mic, 
  Send, 
  ChevronDown, 
  Wrench, 
  Smartphone, 
  UploadCloud, 
  CheckCircle2,
  FileText,
  Briefcase,
  HeartHandshake,
  QrCode,
  Link2,
  Info,
  Layers,
  Terminal,
  Sparkles,
  Check,
  Play,
  AlertCircle,
  Database,
  Key,
  Shield,
  Trash2,
  RefreshCw,
  Sliders,
  Globe,
  BookOpen,
  FileSearch,
  Search,
  CheckSquare,
  Eye,
  FileCode,
  Lock,
  ChevronRight,
  Folder,
  Bell,
  Mail,
  Award,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

// =========================================================================
// --- DECLARAÇÕES DE CONSTANTES GLOBAIS (TOP-LEVEL) ---
// =========================================================================

const INITIAL_PRE_BUILT_AGENTS = [
  { 
    id: 'rita', 
    name: 'Rita', 
    role: 'Especialista em Recrutamento', 
    desc: 'Lê currículos, cruza dados com o Profiler e sugere perguntas ideais para entrevistas.',
    prompt: 'Você é a Rita, especialista de recrutamento e seleção da Sólides. Ajude a selecionar talentos com base em perfil comportamental.',
    mcps: ['consultar_profiler'],
    skills: ['profiler_disc_analyzer'],
    ragSources: ['manual_admissao_2026'],
    channels: ['Sólides Chat'],
    source: 'Sólides Nativo'
  },
  { 
    id: 'paulo', 
    name: 'Paulo', 
    role: 'Especialista em DP', 
    desc: 'Esclarece dúvidas sobre legislação trabalhista, calcula férias, controla registros de ponto e envia holerites.',
    prompt: 'Você é o Paulo, assistant sênior de departamento pessoal. Responda a dúvidas sobre férias, legislação trabalhista e holerites usando as ferramentas de integração.',
    mcps: ['buscar_saldo_ferias', 'enviar_holerite'],
    skills: ['medical_certificate_ocr', 'ponto_auditor'],
    ragSources: ['politica_ferias_clt'],
    channels: ['Sólides Chat', 'WhatsApp Oficial'],
    source: 'Sólides Nativo'
  },
  { 
    id: 'carla', 
    name: 'Carla', 
    role: 'Especialista em Clima & PDI', 
    desc: 'Lê resultados de pesquisas de clima organizacional e sugere planos de desenvolvimento individual.',
    prompt: 'Você é a Carla, especialista de endomarketing e clima de equipe. Analise dados de engajamento dos colaboradores e sugere PDIs construtivos.',
    mcps: ['registrar_feedback'],
    skills: ['pdi_generator'],
    ragSources: ['pesquisa_clima_q1'],
    channels: ['Sólides Chat'],
    source: 'Sólides Nativo'
  },
];

const CUSTOMER_GALLERY_AGENTS = [
  {
    id: 'stone_reembolso',
    name: 'Validador Stone',
    role: 'Aprovador de Despesas e Reembolsos',
    desc: 'Agente compartilhado criado pela equipe da Stone. Conecta-se à API de finanças para aprovar notas fiscais de viagem e lançar no DP.',
    prompt: 'Você valida despesas corporativas contra a política da empresa.',
    mcps: ['totvs_payroll_api'],
    skills: [],
    ragSources: [],
    channels: ['Sólides Chat', 'Slack'],
    source: 'Cliente Stone'
  },
  {
    id: 'hotmart_plr',
    name: 'Calculadora PLR',
    role: 'Simulador de Participação nos Lucros',
    desc: 'Criado pela equipe de RH da Hotmart. Consulta metas de equipes no Jira e calcula projeções de bônus por colaborador.',
    prompt: 'Você calcula simulações amigáveis de PLR com base em notas de desempenho.',
    mcps: ['jira_metrics'],
    skills: [],
    ragSources: [],
    channels: ['Sólides Chat', 'Microsoft Teams'],
    source: 'Cliente Hotmart'
  }
];

const INITIAL_MCPS = [
  { id: 'buscar_saldo_ferias', name: 'buscar_saldo_ferias(cpf)', type: 'Nativo Sólides', desc: 'Retorna o saldo atualizado de férias.', active: true },
  { id: 'enviar_holerite', name: 'enviar_recibo_vencimento(mes, cpf)', type: 'Nativo Sólides', desc: 'Gera e dispara PDF de recibo de vencimento do colaborador.', active: true },
  { id: 'registrar_feedback', name: 'registar_feedback(gestor, liderado, texto)', type: 'Nativo Sólides', desc: 'Adiciona registro formal de feedback no módulo de gestão.', active: true },
  { id: 'consultar_profiler', name: 'consultar_profiler(cpf)', type: 'Nativo Sólides', desc: 'Retorna o mapeamento comportamental Profiler (I, C, S, A).', active: true },
];

const INITIAL_SKILLS = [
  { id: 'medical_certificate_ocr', name: 'Validador de Atestado Médico (OCR)', category: 'Departamento Pessoal', desc: 'Lê arquivos de atestado, extrai o CID, valida assinatura médica e lança de forma autônoma na Sólides.', mcps: [], rags: ['manual_admissao_2026'], instruction: 'Sempre que receber uma foto ou PDF de atestado, aplique OCR, valide as informações no manual e lance a ausência.', custom: false },
  { id: 'profiler_disc_analyzer', name: 'Analisador Profiler Sênior', category: 'Recrutamento & Seleção', desc: 'Interpreta relatórios comportamentais DISC da Sólides para avaliar match de candidatos.', mcps: ['consultar_profiler'], rags: [], instruction: 'Analise o perfil retornado do Profiler comparando a dominância e influência com as características ideais descritas na vaga.', custom: false },
  { id: 'ponto_auditor', name: 'Auditor de Inconsistências de Ponto', category: 'Departamento Pessoal', desc: 'Varre de forma proativa folhas de frequência e aponta buracos ou escalas inválidas antes do fechamento.', mcps: [], rags: [], instruction: 'Mensalmente, execute varreduras nos cartões de ponto buscando por marcações únicas ou jornadas excedentes sem justificativa.', custom: false }
];

const AGENTIC_SKILLS = [
  { id: 'medical_certificate_ocr', name: 'Validador de Atestado Médico (OCR)', category: 'Departamento Pessoal', desc: 'Lê arquivos de atestado, extrai o CID, valida assinatura médica e lança de forma autônoma na Sólides.' },
  { id: 'profiler_disc_analyzer', name: 'Analisador Profiler Sênior', category: 'Recrutamento & Seleção', desc: 'Interpreta relatórios comportamentais DISC da Sólides para avaliar match de candidatos.' },
  { id: 'ponto_auditor', name: 'Auditor de Inconsistências de Ponto', category: 'Departamento Pessoal', desc: 'Varre de forma proativa folhas de frequência e aponta buracos ou escalas inválidas antes do fechamento.' },
  { id: 'pdi_generator', name: 'Gerador de PDI & Trilhas T&D', category: 'Desenvolvimento', desc: 'Analisa gaps de avaliações de desempenho e monta planos de desenvolvimento individual personalizados.' }
];

// --- HELPER DE ÍCONES PARA EVITAR ERROS DE OBJETO RENDERIZADO NO REACT ---
function getAgentIcon(id, size = 20) {
  switch (id) {
    case 'rita':
      return <Briefcase className="text-purple-600 animate-pulse" size={size} />;
    case 'paulo':
      return <FileText className="text-purple-600 animate-pulse" size={size} />;
    case 'carla':
      return <HeartHandshake className="text-purple-600 animate-pulse" size={size} />;
    case 'stone_reembolso':
      return <Database className="text-green-600" size={size} />;
    case 'hotmart_plr':
      return <Sliders className="text-orange-600" size={size} />;
    default:
      return <Bot className="text-purple-600 animate-pulse" size={size} />;
  }
}

// =========================================================================
// --- SUBCOMPONENTES AUXILIARES ---
// =========================================================================

function NavItem({ icon, label, active, onClick, disabled }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors relative border border-transparent ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${
        active ? 'bg-purple-100 text-purple-700 font-bold shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
      {disabled && <span className="absolute right-2 text-[8px] bg-slate-200 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 font-sans font-sans">Em Breve</span>}
    </button>
  );
}

function ManageApisView({ apis, onDelete, onNew, addLog }) {
  const [testingId, setTestingId] = useState(null);

  const testApi = (api) => {
    setTestingId(api.id);
    addLog('system', `Iniciando teste manual de handshake para: ${api.name}`);
    setTimeout(() => {
      setTestingId(null);
      addLog('success', `API '${api.name}' respondeu com STATUS 200 OK.`);
    }, 1200);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gerenciador de APIs (MCP)</h2>
          <p className="text-sm text-slate-500">Monitore as credenciais de autenticação, endpoints e realize testes manuais de ping.</p>
        </div>
        <button onClick={onNew} className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm transition-all hover:translate-y-[-1px]">
          <Plus size={16} />
          <span>Conectar Nova API</span>
        </button>
      </div>

      {apis.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
          <Globe className="text-slate-400 w-12 h-12 mx-auto animate-pulse animate-duration-1000" />
          <p className="font-bold text-slate-700">Nenhuma API registrada</p>
          <p className="text-xs text-slate-400">Você removeu todas as APIs de teste. Conecte uma nova para vincular a algum agente comercial.</p>
          <button onClick={onNew} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-semibold font-sans">Adicionar Agora</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 font-sans font-sans">
          {apis.map(api => (
            <div key={api.id} className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm hover:border-purple-300 transition-colors">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600"><Globe size={20} /></div>
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center space-x-2">
                    <span>{api.name}</span>
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse animate-duration-1000"></span>
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{api.url}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Auth: <span className="font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{api.authType}</span></p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => testApi(api)}
                  disabled={testingId === api.id}
                  className="text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={14} className={testingId === api.id ? "animate-spin animate-duration-1000" : ""} />
                  <span>{testingId === api.id ? "Testando..." : "Testar API"}</span>
                </button>
                <button onClick={() => onDelete(api.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-slate-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManageDbsView({ dbs, onDelete, onNew, addLog }) {
  const [testingId, setTestingId] = useState(null);

  const testDb = (db) => {
    setTestingId(db.id);
    addLog('system', `Tentando ping via socket seguro no banco: ${db.name} (${db.engine})`);
    setTimeout(() => {
      setTestingId(null);
      addLog('success', `Banco de Dados '${db.name}' respondeu em 14ms.`);
    }, 1200);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 font-sans">Gerenciador de Bancos de Dados</h2>
          <p className="text-sm text-slate-500 font-sans">Réplicas de leitura seguras para alimentar as queries estruturadas e cruzamentos da IA.</p>
        </div>
        <button onClick={onNew} className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm transition-all hover:translate-y-[-1px]">
          <Plus size={16} />
          <span>Conectar Novo Banco</span>
        </button>
      </div>

      {dbs.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
          <Database className="text-slate-400 w-12 h-12 mx-auto animate-pulse animate-duration-1000" />
          <p className="font-bold text-slate-700">Nenhum Banco cadastrado</p>
          <button onClick={onNew} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-semibold font-sans">Adicionar Agora</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 font-sans">
          {dbs.map(db => (
            <div key={db.id} className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm hover:border-purple-300 transition-colors">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600"><Database size={20} /></div>
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center space-x-2">
                    <span>{db.name}</span>
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse animate-duration-1000"></span>
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{db.host}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Engine: <span className="font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{db.engine}</span></p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => testDb(db)}
                  disabled={testingId === db.id}
                  className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={14} className={testingId === db.id ? "animate-spin" : ""} />
                  <span>{testingId === db.id ? "Testando..." : "Testar Conexão"}</span>
                </button>
                <button onClick={() => onDelete(db.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-slate-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManageRagsView({ 
  rags, 
  onDelete, 
  onNew, 
  selectedRag, 
  setSelectedRag, 
  searchQuery, 
  setSearchQuery, 
  searchResults, 
  onSearch,
  addLog
}) {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans">
      
      {/* Topo */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gerenciador de RAG & Extrator FAQ</h2>
          <p className="text-sm text-slate-500 font-sans">Mapeie documentos locais e portais de ajuda web em vetores inteligentes para dar contexto de negócio às IAs.</p>
        </div>
        <button onClick={onNew} className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm transition-all hover:translate-y-[-1px]">
          <Plus size={16} />
          <span>Nova Base RAG</span>
        </button>
      </div>

      {/* Grid Lateral de Detalhes + Lista */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
        
        {/* LADO ESQUERDO: LISTA DE BASES RAG ATIVAS */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">Bases Carregadas</h3>
          
          {rags.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8 italic font-sans font-sans">Nenhuma base de conhecimento ativa.</p>
          ) : (
            <div className="space-y-2">
              {rags.map(rag => (
                <div 
                  key={rag.id} 
                  className={`p-3 border rounded-xl flex items-center justify-between transition-all cursor-pointer ${
                    selectedRag && selectedRag.id === rag.id ? 'border-emerald-500 bg-emerald-50/50 font-sans' : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => { setSelectedRag(rag); addLog('system', `Inspecionando fragmentos (chunks) de: ${rag.name}`); }}
                >
                  <div className="flex items-center space-x-3 overflow-hidden font-sans">
                    <BookOpen className="text-emerald-600 flex-shrink-0" size={18} />
                    <div className="overflow-hidden font-sans font-sans">
                      <p className="text-xs font-bold text-slate-800 truncate font-sans">{rag.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{rag.type} • {rag.size}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 font-sans">
                    <button onClick={(e) => { e.stopPropagation(); onDelete(rag.id); }} className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 font-sans"><Trash2 size={14} /></button>
                    <ChevronRight size={14} className="text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* LADO DIREITO: CHUNKING E TESTER SEMÂNTICO */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Visualizador de fragmentos (Chunks) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-3 flex items-center space-x-2 font-sans">
              <FileSearch className="text-emerald-600" size={18} />
              <span>Explorador de Fragmentos Semânticos (Chunking Preview)</span>
            </h3>

            {selectedRag ? (
              <div className="pt-4 space-y-3 font-sans font-sans">
                <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-xl text-xs text-emerald-800 font-sans font-sans font-sans">
                  <span className="font-semibold font-sans">Inspecionando: {selectedRag.name}</span>
                  <span className="bg-emerald-600 text-white font-bold px-2 py-0.5 rounded text-[10px] font-mono font-sans">{selectedRag.chunks.length} Fragmentos Gerados</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 font-sans font-sans">
                  {selectedRag.chunks.map((chunk, i) => (
                    <div key={i} className="border border-slate-100 bg-slate-50 p-3 rounded-lg relative font-sans font-sans">
                      <span className="absolute top-2 right-2 font-mono text-[9px] bg-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded font-sans">Similarity Score: {chunk.score || '0.99'}</span>
                      <p className="text-xs text-slate-600 leading-relaxed pt-2 font-sans">"{chunk.text}"</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-12 font-sans font-sans">Selecione uma Base de Conhecimento na lista ao lado para ver a quebra semântica realizada pela IA.</p>
            )}
          </div>

          {/* Testador Semântico Avançado */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 font-sans">
            <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">Simulador de Busca Semântica (Playground RAG)</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Digite termos chaves como "combustível" ou "admissão" para testar como o banco de vetores nativo retorna os blocks exatos que responderiam a dúvida do funcionário.</p>
            
            <div className="flex gap-2">
              <div className="flex-1 relative font-sans">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-sans font-sans" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ex: Qual o valor do reembolso de quilometragem?" 
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-emerald-500 font-semibold font-sans font-sans"
                />
              </div>
              <button 
                onClick={onSearch}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg"
              >
                Buscar Chunks
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2 pt-2 max-h-48 overflow-y-auto font-sans font-sans">
                <p className="text-[10px] font-bold text-emerald-700 uppercase font-sans font-sans">Resultados da Similarity Score:</p>
                {searchResults.map((res, i) => (
                  <div key={i} className="p-3 border border-emerald-100 bg-emerald-50/20 rounded-lg space-y-1 font-sans font-sans">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 font-sans">
                      <span>Origem: {res.ragName}</span>
                      <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-sans">Score: {res.score}</span>
                    </div>
                    <p className="text-xs text-slate-600">"{res.text}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}

function ManageAlertsView({ alerts, agents, onDelete, onToggleActive, onNew, addLog }) {
  const [firingId, setTestingId] = useState(null);

  const simulateAlertTrigger = (alert) => {
    setTestingId(alert.id);
    addLog('system', `Iniciando rotina agêntica para o alerta: "${alert.name}"`);
    
    setTimeout(() => {
      addLog('thinking', `Agente buscando dados do banco Sólides correspondentes a "${alert.trigger}"`);
      setTimeout(() => {
        addLog('mcp-call', `Disparando notificação formatada via ${alert.channel}`);
        setTimeout(() => {
          setTestingId(null);
          addLog('success', `Alerta de rotina disparado com sucesso! Colaboradores avisados.`);
        }, 1000);
      }, 1000);
    }, 600);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Alertas Agênticos Automatizados</h2>
          <p className="text-sm text-slate-500">Programe disparos de alertas inteligentes, conecte-os a canais como WhatsApp ou Slack e simplifique o DP da sua equipe.</p>
        </div>
        <button onClick={onNew} className="flex items-center space-x-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-amber-700 shadow-sm transition-all hover:translate-y-[-1px]">
          <Plus size={16} />
          <span>Criar Alerta Automático</span>
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-md mx-auto space-y-4 animate-in fade-in duration-300">
          <Bell className="text-slate-400 w-12 h-12 mx-auto animate-bounce" />
          <p className="font-bold text-slate-700 font-sans font-sans">Nenhum Alerta Ativo</p>
          <p className="text-xs text-slate-400 font-sans">Você não possui rotinas agênticas registradas. Crie um alerta para monitoramento CLT ou inconsistências do ponto.</p>
          <button onClick={onNew} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Criar Alerta</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 font-sans font-sans">
          {alerts.map(al => {
            const assignedAgent = agents.find(ag => ag.id === al.agentId) || { name: 'Paulo' };
            return (
              <div key={al.id} className={`bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm hover:border-amber-300 transition-colors ${!al.active && 'opacity-60'}`}>
                <div className="flex items-start space-x-4 font-sans font-sans">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${al.active ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                    <Bell size={20} className={al.active ? "animate-pulse" : ""} />
                  </div>
                  <div className="space-y-1 font-sans font-sans font-sans">
                    <h4 className="font-bold text-slate-800 flex items-center space-x-2 font-sans font-sans font-sans">
                      <span>{al.name}</span>
                      {al.active ? (
                        <span className="bg-green-100 text-green-700 text-[9px] font-bold px-2 py-0.5 rounded-full">Ativo</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-2 py-0.5 rounded-full">Pausado</span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">Gatilho: <span className="text-slate-700 font-semibold">{al.trigger}</span></p>
                    <p className="text-[10px] text-slate-400">Canal: <span className="bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded mr-2">{al.channel}</span> Agente Responsável: <span className="font-bold text-purple-700">{assignedAgent.name} ({assignedAgent.role})</span></p>
                    
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[10px] text-slate-500 font-medium max-w-xl italic mt-2">
                      <span className="font-bold text-slate-400 not-italic block uppercase text-[8px] mb-1 font-sans font-sans">Visualização da Mensagem:</span>
                      "{al.template}"
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3 font-sans">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={al.active} 
                      onChange={() => onToggleActive(al.id)}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600 font-sans"></div>
                  </label>

                  <button 
                    onClick={() => simulateAlertTrigger(al)}
                    disabled={firingId === al.id || !al.active}
                    className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw size={14} className={firingId === al.id ? "animate-spin animate-duration-1000" : ""} />
                    <span>{firingId === al.id ? "Processando..." : "Disparar Teste"}</span>
                  </button>

                  <button onClick={() => onDelete(al.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-slate-50 rounded-lg transition-colors font-sans"><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ========================================================================= 
// SUBVIEW: GERENCIADOR E CRIADOR CONVERSACIONAL DE SKILLS (OPENCLAW INSPIRED)
// =========================================================================
function ManageSkillsView({ skills, customApis, customDbs, customRags, onDelete, onNewCustomSkill, addLog }) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [buildMode, setBuildMode] = useState('chat'); // 'chat' | 'manual'
  
  // States para o Criador Manual
  const [skillName, setSkillName] = useState('');
  const [skillCategory, setSkillCategory] = useState('Departamento Pessoal');
  const [skillDesc, setSkillDesc] = useState('');
  const [selectedRags, setSelectedRags] = useState([]);
  const [selectedMcps, setSelectedMcps] = useState([]);
  const [instruction, setInstruction] = useState('');

  // States para o Assistente Conversacional (Chat Builder)
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'assistant', text: 'Olá! Sou o Assistente de IA do Agent Studio. Diga-me qual Habilidade de RH ou DP você gostaria que eu criasse, explicando as regras e quais ferramentas de dados ela deve acessar.' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  
  // Sugestão de IA gerada na conversa
  const [proposedSkill, setProposedSkill] = useState(null);

  const toggleMcp = (id) => {
    setSelectedMcps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleRag = (id) => {
    setSelectedRags(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleManualCreate = () => {
    if (!skillName || !skillDesc || !instruction) return;
    const newSkill = {
      id: `skill_${Date.now()}`,
      name: skillName,
      category: skillCategory,
      desc: skillDesc,
      mcps: selectedMcps,
      rags: selectedRags,
      instruction: instruction,
      custom: true
    };
    onNewCustomSkill(newSkill);
    resetBuilder();
  };

  const resetBuilder = () => {
    setShowBuilder(false);
    setSkillName('');
    setSkillDesc('');
    setInstruction('');
    setSelectedRags([]);
    setSelectedMcps([]);
    setChatHistory([
      { sender: 'assistant', text: 'Olá! Sou o Assistente de IA do Agent Studio. Diga-me qual Habilidade de RH ou DP você gostaria que eu criasse, explicando as regras e quais ferramentas de dados ela deve acessar.' }
    ]);
    setProposedSkill(null);
  };

  // Simular processo conversacional de criação de Skill
  const handleSendChatBuild = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatHistory(prev => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');
    setIsTyping(true);

    setTimeout(() => {
      // Analisar texto para simular inteligência
      const lower = userText.toLowerCase();
      let responseText = '';
      let generatedProposal = null;

      if (lower.includes('reembolso') || lower.includes('viagem') || lower.includes('combustível')) {
        generatedProposal = {
          name: 'Auditor Inteligente de Reembolsos',
          category: 'Departamento Pessoal',
          desc: 'Cruza notas de viagem com as políticas e cadastra despesas validadas no Totvs RM.',
          mcps: ['totvs_payroll_api'],
          rags: ['politica_reembolso_viagem'],
          instruction: 'Sempre que o usuário enviar uma nota fiscal ou recibo de viagem, consulte as tabelas de limite de refeição e combustível na base RAG [FAQ Política de Reembolso]. Verifique as permissões de cargo chamando a [API Totvs RM] e, se tudo estiver em conformidade, grave a transação no banco.'
        };

        responseText = `Entendido! Você deseja criar uma habilidade robusta de auditoria e validação de reembolsos corporativos.\n\nCom base nas ferramentas de dados ativas na sua Sólides, mapeei as conexões perfeitas:\n\n1. **Base RAG**: Associado o arquivo *FAQ Política de Reembolsos*\n2. **MCP**: Conectada a *API Totvs RM* para aprovações automáticas.\n\nDesenhei o fluxo de orquestração ideal ao lado. Deseja registrar e ativar essa Skill?`;
      } else if (lower.includes('ponto') || lower.includes('inconsistência') || lower.includes('atraso')) {
        generatedProposal = {
          name: 'Fiscal Inteligente de Escala',
          category: 'Departamento Pessoal',
          desc: 'Identifica atrasos contínuos e furos no ponto, notificando o gestor diretamente no Slack.',
          mcps: ['slack_alerts'],
          rags: ['manual_admissao_2026'],
          instruction: 'Analise os cartões de registro agregados no banco Supabase de DP. Se for identificada uma inconsistência de entrada superior a 15 minutos sem justificativa médica válida indexada no RAG, dispare uma notificação formal de alerta para o Slack do gestor de equipe.'
        };

        responseText = `Excelente! Mapeei uma nova Habilidade focada em automação de cartões de frequência de funcionários.\n\nAssociei as conexões de destino:\n1. **Banco**: *Supabase Datawarehouse* (réplica local)\n2. **Alerta**: Notificação ativa formatada via *SlackNotificationTool*.\n\nVerifique o template de fluxo gerado à direita e confirme para salvar.`;
      } else {
        appendGeneralProposal();
        return;
      }

      setChatHistory(prev => [...prev, { sender: 'assistant', text: responseText }]);
      setProposedSkill(generatedProposal);
      setIsTyping(false);
    }, 1500);
  };

  const appendGeneralProposal = () => {
    const defaultProposal = {
      name: 'Assistente de Validação Geral',
      category: 'Geral',
      desc: 'Habilidade criada de forma conversacional para executar e condensar regras de documentos cadastrados.',
      mcps: ['buscar_saldo_ferias'],
      rags: ['manual_admissao_2026'],
      instruction: 'Sempre responda as dúvidas do colaborador buscando primeiramente na base de contexto. Caso exija uma consulta estruturada, utilize a API correspondente e resuma os dados.'
    };
    setChatHistory(prev => [...prev, { sender: 'assistant', text: 'Entendi o escopo! Mapeei um assistente genérico de cruzamento que combina sua base de dados com o manual do colaborador. Veja a especificação lógica ao lado e clique em Confirmar.' }]);
    setProposedSkill(defaultProposal);
    setIsTyping(false);
  };

  const confirmGeneratedSkill = () => {
    if (!proposedSkill) return;
    const newSkill = {
      id: `skill_${Date.now()}`,
      name: proposedSkill.name,
      category: proposedSkill.category,
      desc: proposedSkill.desc,
      mcps: proposedSkill.mcps || [],
      rags: proposedSkill.rags || [],
      instruction: proposedSkill.instruction,
      custom: true
    };
    onNewCustomSkill(newSkill);
    resetBuilder();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-center font-sans">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 font-sans">Suas Habilidades Operacionais (Agentic Skills)</h2>
          <p className="text-sm text-slate-500 font-medium">As Skills são as receitas lógicas de negócio. Elas ensinam os agentes a combinar RAGs e APIs de forma ordenada e inteligente.</p>
        </div>
        {!showBuilder && (
          <button 
            onClick={() => setShowBuilder(true)} 
            className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-purple-700 shadow-sm"
          >
            <Plus size={16} />
            <span>Criar Habilidade (OpenClaw)</span>
          </button>
        )}
      </div>

      {showBuilder ? (
        /* INTERFACE DO CONSTRUTOR DE SKILLS */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 animate-in fade-in duration-200">
          
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 font-sans">
            <div className="flex items-center space-x-2 text-purple-700">
              <Sparkles size={20} className="animate-pulse" />
              <span className="font-bold text-sm">Criar Habilidade Customizada</span>
            </div>
            <div className="flex space-x-2 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              <button 
                type="button" 
                onClick={() => { setBuildMode('chat'); setProposedSkill(null); }}
                className={`px-3 py-1.5 rounded-md transition-all ${buildMode === 'chat' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Assistente de IA (Conversacional)
              </button>
              <button 
                type="button" 
                onClick={() => { setBuildMode('manual'); setProposedSkill(null); }}
                className={`px-3 py-1.5 rounded-md transition-all ${buildMode === 'manual' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Montar Manualmente (Formulário)
              </button>
            </div>
          </div>

          {/* CONSTRUTOR CONVERSACIONAL */}
          {buildMode === 'chat' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch font-sans">
              
              {/* Painel Esquerdo: Chat com o Copilot da Sólides */}
              <div className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between bg-slate-50/50 h-[380px] max-h-[380px]">
                <div className="overflow-y-auto space-y-3 flex-1 mb-4 pr-1">
                  {chatHistory.map((chat, idx) => (
                    <div key={idx} className={`flex ${chat.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-3 rounded-xl text-xs leading-relaxed max-w-[85%] ${
                        chat.sender === 'user' ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                      }`}>
                        {chat.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="text-slate-400 text-[10px] animate-pulse">Assistente do Agent Studio mapeando conexões...</div>
                  )}
                </div>

                <form onSubmit={handleSendChatBuild} className="flex gap-2">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ex: Quero criar um fluxo para auditar notas de reembolso de combustível."
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-purple-500"
                  />
                  <button type="submit" className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 transition-all">
                    <Send size={14} />
                  </button>
                </form>
              </div>

              {/* Painel Direito: Configuração da Habilidade sugerida pela IA */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white flex flex-col justify-between h-[380px] overflow-y-auto">
                {proposedSkill ? (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-purple-50 p-2 rounded-lg text-purple-700 text-[10px] font-bold">
                        <span>Habilidade Proposta por IA</span>
                        <span>OpenClaw Parser</span>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">NOME GERADO</p>
                        <p className="text-xs font-bold text-slate-800">{proposedSkill.name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 font-sans">DESCRIÇÃO</p>
                        <p className="text-xs text-slate-600 leading-snug">{proposedSkill.desc}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">FERRAMENTAS ACOPLADAS</p>
                        <div className="flex flex-wrap gap-1 mt-1 font-sans">
                          {proposedSkill.rags && proposedSkill.rags.map(r => (
                            <span key={r} className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-100">RAG: {r}</span>
                          ))}
                          {proposedSkill.mcps && proposedSkill.mcps.map(m => (
                            <span key={m} className="bg-purple-50 text-purple-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-purple-100">MCP: {m}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Instrução de Raciocínio (Orquestrador)</p>
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-medium leading-relaxed italic text-slate-600">
                          "{proposedSkill.instruction}"
                        </div>
                      </div>
                    </div>

                    <button 
                      type="button" 
                      onClick={confirmGeneratedSkill}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg text-xs font-sans"
                    >
                      Confirmar e Ativar Habilidade
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 space-y-2">
                    <Sparkles className="text-slate-300 w-10 h-10 animate-bounce" />
                    <p className="text-xs font-semibold text-slate-600">Mapeamento da Habilidade Pendente</p>
                    <p className="text-[10px] max-w-xs leading-relaxed">Diga ao assistente de IA na caixa ao lado o que você quer fazer, e ele gerará a configuração perfeita integrando seus MCPs e manuais.</p>
                    <button 
                      type="button" 
                      onClick={() => handleSendChatBuild({ preventDefault: () => {} }, "Quero criar uma skill de auditoria de viagens")}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200 text-purple-700 px-3 py-1.5 rounded-full border border-slate-200 mt-2 font-semibold"
                    >
                      💡 Exemplo: "Skill de Reembolso de Viagens"
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* CONSTRUTOR MANUAL */}
          {buildMode === 'manual' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start font-sans">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 font-sans">Nome da Habilidade</label>
                  <input type="text" placeholder="Ex: Aprovador de Despesas" value={skillName} onChange={(e) => setSkillName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Descrição</label>
                  <input type="text" placeholder="O que essa habilidade faz?" value={skillDesc} onChange={(e) => setSkillDesc(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Instrução Lógica (Prompt de Execução)</label>
                  <textarea rows="3" placeholder="Sempre que o usuário solicitar X, primeiro valide no RAG Y e depois dispare o MCP Z." value={instruction} onChange={(e) => setInstruction(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans resize-none"></textarea>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Acoplar Bases de Dados RAG</label>
                  <div className="space-y-1.5 max-h-24 overflow-y-auto">
                    {customRags.map(r => (
                      <label key={r.id} className="flex items-center space-x-2 text-xs">
                        <input type="checkbox" checked={selectedRags.includes(r.id)} onChange={() => toggleRag(r.id)} className="text-purple-600 rounded" />
                        <span>{r.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Acoplar APIs / MCPs técnicos</label>
                  <div className="space-y-1.5 max-h-24 overflow-y-auto">
                    {[...INITIAL_MCPS, ...customApis].map(m => (
                      <label key={m.id} className="flex items-center space-x-2 text-xs font-sans">
                        <input type="checkbox" checked={selectedMcps.includes(m.id)} onChange={() => toggleMcp(m.id)} className="text-purple-600 rounded font-sans" />
                        <span>{m.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex space-x-2 justify-end">
                  <button type="button" onClick={resetBuilder} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs font-semibold">Cancelar</button>
                  <button type="button" onClick={handleManualCreate} disabled={!skillName || !skillDesc || !instruction} className="px-5 py-2 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50">Criar Habilidade</button>
                </div>
              </div>
            </div>
          )}

        </div>
      ) : (
        /* GALERIA E LISTA DE SKILLS */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
          {skills.map(sk => (
            <div key={sk.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between font-sans">
              {sk.custom ? (
                <span className="absolute top-0 right-0 bg-purple-100 text-purple-700 text-[9px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider font-sans">Customizada</span>
              ) : (
                <span className="absolute top-0 right-0 bg-slate-100 text-slate-600 text-[9px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider font-sans">Nativa Sólides</span>
              )}
              
              <div className="space-y-3 font-sans">
                <div className="flex items-center space-x-3 font-sans">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                    <Award size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{sk.name}</h3>
                    <p className="text-[10px] text-purple-600 font-semibold">{sk.category || 'DP / Gestão'}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-snug">{sk.desc}</p>

                {/* Exibir Orquestração e as ferramentas vinculadas de forma didática para o cliente */}
                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[10px] space-y-1.5 font-sans">
                  <p className="font-bold text-slate-400 uppercase text-[8px] font-sans">Regras de Execução & Conexões:</p>
                  <p className="text-slate-600 italic font-sans">"{sk.instruction}"</p>
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/60 mt-1 font-sans">
                    {sk.rags && sk.rags.map(r => (
                      <span key={r} className="bg-emerald-50 text-emerald-700 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">RAG: {r.replace('_', ' ')}</span>
                    ))}
                    {sk.mcps && sk.mcps.map(m => (
                      <span key={m} className="bg-purple-50 text-purple-700 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">MCP: {m.replace('_', ' ')}</span>
                    ))}
                  </div>
                </div>
              </div>

              {sk.custom && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end font-sans">
                  <button onClick={() => onDelete(sk.id)} className="text-slate-400 hover:text-red-500 text-xs font-semibold flex items-center space-x-1 font-sans">
                    <Trash2 size={12} />
                    <span>Excluir Habilidade</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreView({ myAgents, setMyAgents, addLog }) {
  const [successToast, setSuccessToast] = useState('');
  const [activeTab, setActiveTab] = useState('nativos'); 

  const handleHireAgent = (agent) => {
    if (myAgents.some(a => a.id === agent.id)) {
      setSuccessToast(`O agente ${agent.name} já faz parte da sua força de trabalho digital.`);
      setTimeout(() => setSuccessToast(''), 3000);
      return;
    }

    setMyAgents(prev => [...prev, agent]);
    addLog('system', `Agente instalado: '${agent.name}' foi adicionado à sua conta.`);
    setSuccessToast(`Contratação realizada! ${agent.name} agora está nos seus Agentes.`);
    setTimeout(() => setSuccessToast(''), 4000);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans font-sans">
      
      {successToast && (
        <div className="bg-green-600 text-white px-4 py-3 rounded-xl flex items-center justify-between shadow-lg text-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center space-x-2">
            <Check size={18} />
            <span className="font-semibold">{successToast}</span>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Agent Store</h2>
          <p className="text-slate-500 mt-1 font-medium text-sm font-sans">Expanda sua equipe de RH em segundos contratando especialistas pré-configurados pela Sólides ou compartilhados pela comunidade.</p>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-slate-200 font-sans">
        <button 
          onClick={() => setActiveTab('nativos')} 
          className={`pb-2.5 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'nativos' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Nativos Sólides
        </button>
        <button 
          onClick={() => setActiveTab('comunidade')} 
          className={`pb-2.5 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'comunidade' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Galeria de Clientes / Compartilhados (Exemplos de Integrações)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 font-sans">
        {activeTab === 'nativos' ? (
          INITIAL_PRE_BUILT_AGENTS.map(agent => {
            const isHired = myAgents.some(a => a.id === agent.id);
            return (
              <div key={agent.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between group font-sans">
                <div className="absolute top-0 right-0 bg-purple-100 text-purple-700 text-[9px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider font-sans">RH Nativo</div>
                <div>
                  <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {getAgentIcon(agent.id, 24)}
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">{agent.name}</h3>
                  <p className="text-xs font-semibold text-purple-600 mb-3">{agent.role}</p>
                  <p className="text-sm text-slate-500 mb-6 line-clamp-3 leading-relaxed font-sans">{agent.desc}</p>
                </div>
                
                <button 
                  onClick={() => handleHireAgent(agent)}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors font-sans ${
                    isHired 
                      ? 'bg-slate-100 text-slate-500 cursor-not-allowed' 
                      : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
                  }`}
                >
                  {isHired ? 'Agente Ativo' : 'Adicionar à Minha Equipe'}
                </button>
              </div>
            );
          })
        ) : (
          CUSTOMER_GALLERY_AGENTS.map(agent => {
            const isHired = myAgents.some(a => a.id === agent.id);
            return (
              <div key={agent.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between group font-sans">
                <div className="absolute top-0 right-0 bg-slate-100 text-slate-600 text-[9px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider font-sans">{agent.source}</div>
                <div>
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {getAgentIcon(agent.id, 24)}
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">{agent.name}</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-3">{agent.role}</p>
                  <p className="text-sm text-slate-500 mb-6 line-clamp-3 leading-relaxed font-sans">{agent.desc}</p>
                </div>
                
                <button 
                  onClick={() => handleHireAgent(agent)}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors font-sans ${
                    isHired 
                      ? 'bg-slate-100 text-slate-500 cursor-not-allowed' 
                      : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                  }`}
                >
                  {isHired ? 'Agente Ativo' : 'Importar da Galeria'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MyAgentsView({ agents, onNew, whatsAppConnected }) {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Minha Equipe Digital</h2>
          <p className="text-slate-500 mt-1 font-medium text-sm font-sans">Controle as atribuições, status e permissões das suas IAs.</p>
        </div>
        <button onClick={onNew} className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm transition-all hover:translate-y-[-1px]">
          <Plus size={16} />
          <span>Criar Agente (Studio)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
        {agents.map(agent => (
          <div key={agent.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-purple-300 transition-colors animate-in fade-in duration-200">
            
            <div className="flex items-start space-x-4 mb-4 font-sans font-sans">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                 {getAgentIcon(agent.id, 24)}
              </div>
              <div className="flex-1 font-sans">
                 <h3 className="font-bold text-slate-800 flex items-center space-x-2 font-sans font-sans">
                   <span>{agent.name}</span>
                   <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Pronto para uso"></span>
                 </h3>
                 <p className="text-xs text-purple-600 font-bold">{agent.role}</p>
                 <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{agent.desc}</p>
              </div>
            </div>

            {/* MCP tools associadas */}
            <div className="border-t border-slate-100 pt-3 pb-3 space-y-2">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Habilidades API:</span>
                <div className="flex flex-wrap gap-1 font-mono">
                  {agent.mcps && agent.mcps.map(tool => (
                    <span key={tool} className="text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-medium">
                      {tool}()
                    </span>
                  ))}
                </div>
              </div>

              {agent.ragSources && agent.ragSources.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1 font-sans">Bases RAG Associadas:</span>
                  <div className="flex flex-wrap gap-1 font-sans">
                    {agent.ragSources.map(ragId => (
                      <span key={ragId} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded font-bold font-sans">
                        {ragId === 'manual_admissao_2026' ? 'Manual do Colaborador' : ragId === 'politica_ferias_clt' ? 'Regras de Férias' : 'Pesquisa de Clima Q1'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Canais Vinculados */}
            <div className="border-t border-slate-100 pt-3 flex items-center justify-between font-medium font-sans font-sans">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Origem do Cérebro:</span>
                <div className="flex items-center space-x-1.5 mt-1 font-sans">
                  <span className="text-[9px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded">{agent.source}</span>
                  {whatsAppConnected && agent.id === 'paulo' && (
                    <span className="text-[9px] bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded font-sans">WhatsApp</span>
                  )}
                </div>
              </div>
              <button className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-1.5 rounded-lg transition-colors font-sans"><Settings size={18} /></button>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================================================= 
// SUBVIEW: AGENT STUDIO (WIZARD COMPONENT WITHOUT UNNECESSARY SCROLLS)
// =========================================================================
function StudioView({ availableMcps, customApis, customDbs, customRags, customSkills, onCreate }) {
  const [currentStep, setCurrentStep] = useState(1); // 1: Identidade, 2: RAG, 3: Skills & Conexões, 4: Canais & Alertas

  // State local do formulário
  const [name, setName] = useState('');
  const [role, setRole] = useState('Especialista de RH');
  const [desc, setDesc] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedMcps, setSelectedMcps] = useState([]);
  const [selectedRags, setSelectedRags] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState(['Sólides Chat']);

  const handleMcpToggle = (id) => {
    setSelectedMcps(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleRagToggle = (id) => {
    setSelectedRags(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSkillToggle = (id) => {
    setSelectedSkills(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleChannelToggle = (channelName) => {
    setSelectedChannels(prev => 
      prev.includes(channelName) ? prev.filter(x => x !== channelName) : [...prev, channelName]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !desc) return;
    
    // Combina MCPs tradicionais e IDs de Skills para o payload geral
    const finalMcps = [...selectedMcps, ...selectedSkills];

    onCreate({
      name,
      role,
      desc,
      prompt,
      mcps: finalMcps,
      ragSources: selectedRags,
      channels: selectedChannels
    });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 font-sans flex flex-col h-full font-sans">
      
      {/* Barra de Progresso Visual Superior */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs">1</div>
          <span className={`text-xs font-bold ${currentStep === 1 ? 'text-purple-700' : 'text-slate-400'}`}>Identidade</span>
        </div>
        <div className="h-0.5 w-12 bg-slate-200 flex-1 mx-3" />
        <div className="flex items-center space-x-1.5">
          <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs ${currentStep >= 2 ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400'}`}>2</div>
          <span className={`text-xs font-bold ${currentStep === 2 ? 'text-purple-700' : 'text-slate-400'}`}>Base RAG</span>
        </div>
        <div className="h-0.5 w-12 bg-slate-200 flex-1 mx-3" />
        <div className="flex items-center space-x-1.5">
          <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs ${currentStep >= 3 ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400'}`}>3</div>
          <span className={`text-xs font-bold ${currentStep === 3 ? 'text-purple-700' : 'text-slate-400'}`}>Skills & APIs</span>
        </div>
        <div className="h-0.5 w-12 bg-slate-200 flex-1 mx-3" />
        <div className="flex items-center space-x-1.5">
          <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs ${currentStep >= 4 ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400'}`}>4</div>
          <span className={`text-xs font-bold ${currentStep === 4 ? 'text-purple-700' : 'text-slate-400'}`}>Canais & Ativação</span>
        </div>
      </div>

      {/* Conteúdo dinâmico de acordo com o Step */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex-1 flex flex-col justify-between">
        
        {/* STEP 1: IDENTIDADE */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-slate-100 pb-3 flex items-center space-x-2">
              <Bot className="text-purple-600 animate-pulse" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">Passo 1: Quem é o seu Funcionário Digital?</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 font-sans">Nome do Agente</label>
                <input 
                  type="text" 
                  placeholder="Ex: Amanda, Douglas" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 font-sans font-sans">Cargo / Especialidade</label>
                <input 
                  type="text" 
                  placeholder="Ex: Auditor de Holerites & CLT" 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 font-sans">O que ele faz? (Descrição Curta)</label>
              <input 
                type="text" 
                placeholder="Ex: Analisa atestados, detecta fraudes e lança eventos automaticamente no DP." 
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 font-sans">Diretrizes de Comportamento (Prompt de Sistema)</label>
              <textarea 
                rows="4" 
                placeholder="Você é o Douglas. Mantenha uma atitude proativa para detectar inconsistências. Sempre solicite que o usuário anexe as notas fiscais antes de validar um reembolso." 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none font-sans"
              ></textarea>
            </div>
          </div>
        )}

        {/* STEP 2: RAG SOURCES */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-slate-100 pb-3 flex items-center space-x-2 font-sans">
              <BookOpen className="text-emerald-600 animate-pulse" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">Passo 2: Fontes de Conhecimento (RAG)</h3>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed font-sans font-medium">
              Associe regulamentos, guias e FAQs que esse agente pode ler para responder às dúvidas dos funcionários em tempo real.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
              {customRags.map(rag => (
                <label 
                  key={rag.id} 
                  className={`p-3 border rounded-xl flex items-start space-x-3 cursor-pointer transition-colors ${
                    selectedRags.includes(rag.id) ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedRags.includes(rag.id)} 
                    onChange={() => handleRagToggle(rag.id)}
                    className="text-emerald-600 rounded mt-0.5 focus:ring-emerald-500 font-sans" 
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{rag.name}</p>
                    <p className="text-[10px] text-emerald-700 font-semibold">{rag.type} • {rag.chunks.length} Chunks</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: AGENTIC SKILLS & MCPS */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200 flex-1 font-sans">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-purple-700">
                <Wrench size={18} />
                <h3 className="font-bold text-slate-800 text-sm">Passo 3: Habilidades Prontas (Skills) & Conexões Técnicas</h3>
              </div>
              <span className="text-[9px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full font-sans uppercase">Modular Engine</span>
            </div>

            {/* Habilidades Agênticas Modulares */}
            <div className="space-y-3 font-sans">
              <p className="text-xs font-bold text-purple-700 uppercase flex items-center space-x-1 font-sans">
                <Award size={14} />
                <span>Habilidades do Ecossistema Sólides (Skills)</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {AGENTIC_SKILLS.map(skill => (
                  <div 
                    key={skill.id}
                    onClick={() => handleSkillToggle(skill.id)}
                    className={`p-3 border rounded-xl flex items-start space-x-3 cursor-pointer transition-colors ${
                      selectedSkills.includes(skill.id) ? 'border-purple-500 bg-purple-50/40' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedSkills.includes(skill.id)}
                      onChange={() => {}}
                      className="text-purple-600 rounded focus:ring-purple-500 mt-0.5 font-sans" 
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                        <span>{skill.name}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 leading-snug mt-1 font-sans">{skill.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Conexões Técnicas MCP */}
            <div className="pt-4 border-t border-slate-100 space-y-3 font-sans">
              <p className="text-xs font-bold text-slate-400 uppercase font-sans">Conexões Técnicas Integradas (APIs / Bancos)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[...INITIAL_MCPS, ...customApis, ...customDbs].map(tool => (
                  <label 
                    key={tool.id} 
                    className={`p-2.5 border rounded-xl flex items-start space-x-2.5 cursor-pointer transition-colors ${
                      selectedMcps.includes(tool.id) ? 'border-indigo-500 bg-indigo-50/40 font-sans' : 'border-slate-200 hover:bg-slate-50 font-sans'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedMcps.includes(tool.id)}
                      onChange={() => handleMcpToggle(tool.id)}
                      className="text-indigo-600 rounded focus:ring-indigo-500 mt-0.5" 
                    />
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-slate-800 truncate">{tool.name}</p>
                      <p className="text-[9px] text-slate-500 font-mono mt-0.5 truncate">{tool.type || 'DB / API'}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* STEP 4: DISTRIBUIÇÃO E CANAIS */}
        {currentStep === 4 && (
          <div className="space-y-4 animate-in fade-in duration-200 font-sans">
            <div className="border-b border-slate-100 pb-3 flex items-center space-x-2">
              <Smartphone className="text-purple-600 animate-pulse animate-duration-1000" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">Passo 4: Canais de Distribuição & Ativação</h3>
            </div>

            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              Onde o seu agente vai atuar para interagir e enviar notificações ativas para os colaboradores e gestores?
            </p>

            <div className="grid grid-cols-2 gap-4">
              {['Sólides Chat', 'WhatsApp Oficial', 'Microsoft Teams', 'Slack'].map(channel => (
                <div 
                  key={channel} 
                  onClick={() => handleChannelToggle(channel)}
                  className={`p-4 border rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                    selectedChannels.includes(channel) ? 'border-purple-500 bg-purple-50/40 font-semibold' : 'border-slate-200 hover:bg-slate-50 font-sans'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <input type="checkbox" checked={selectedChannels.includes(channel)} onChange={() => {}} className="text-purple-600 rounded focus:ring-purple-500" />
                    <span className="text-xs text-slate-700 font-semibold font-sans">{channel}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl flex items-start space-x-3 text-xs text-purple-800 font-sans">
              <CheckCircle2 className="flex-shrink-0 text-purple-600 mt-0.5 animate-bounce" size={16} />
              <div>
                <p className="font-bold">Validação de Segurança Sólides:</p>
                <p className="mt-0.5 leading-snug">Ao clicar em ativar, o agente Douglas será instanciado na infraestrutura de réplica do cliente com segurança sandboxed.</p>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé de Controle de Step */}
        <div className="pt-4 border-t border-slate-100 mt-6 flex justify-between">
          {currentStep > 1 ? (
            <button 
              type="button" 
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="flex items-center space-x-1.5 px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors font-sans"
            >
              <ArrowLeft size={14} />
              <span>Voltar</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < 4 ? (
            <button 
              type="button" 
              onClick={() => setCurrentStep(prev => prev + 1)}
              className="flex items-center space-x-1.5 px-5 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 shadow-sm transition-all font-sans"
            >
              <span>Avançar</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button 
              type="button" 
              onClick={handleSubmit}
              disabled={!name || !desc}
              className="bg-purple-600 text-white font-bold px-6 py-2 rounded-lg text-xs hover:bg-purple-700 shadow-md transition-all disabled:opacity-50 font-sans"
            >
              Ativar Força de Trabalho Digital
            </button>
          )}
        </div>

      </div>

    </div>
  );
}

// ========================================================================= 
// COMPONENTE PRINCIPAL (DEFAULT EXPORT)
// =========================================================================
export default function SolidesMockup() {
  const [currentView, setCurrentView] = useState('chat'); // 'chat' | 'store' | 'studio' | 'my-agents' | 'manage-apis' | 'manage-dbs' | 'manage-rags' | 'manage-alerts' | 'manage-skills'
  const [myAgents, setMyAgents] = useState(INITIAL_PRE_BUILT_AGENTS);
  const [selectedChatAgent, setSelectedChatAgent] = useState(INITIAL_PRE_BUILT_AGENTS[1]); // Começa com Paulo (DP)
  
  // Estado de Visibilidade do Terminal
  const [showTerminal, setShowTerminal] = useState(true);

  // APIs do cliente
  const [customApis, setCustomApis] = useState([
    { id: 'totvs_payroll_api', name: 'API Totvs RM', url: 'https://api.totvs.com.br/v1/payroll', authType: 'Bearer Token', status: 'connected' },
    { id: 'jira_metrics', name: 'Jira Performance Metrics', url: 'https://jira.demoltda.atlassian.net/rest', authType: 'API Key', status: 'connected' }
  ]);

  // Bancos de dados do cliente
  const [customDbs, setCustomDbs] = useState([
    { id: 'supabase_dw', name: 'Supabase Datawarehouse', engine: 'PostgreSQL', host: 'aws-0-sa-east-1.pooler.supabase.com', status: 'connected' }
  ]);

  // Bases RAG do cliente
  const [customRags, setCustomRags] = useState([
    { id: 'manual_admissao_2026', name: 'Manual do Colaborador 2026.pdf', type: 'Documento PDF', size: '2.4 MB', chunks: [
      { id: 1, text: "A admissão requer os documentos clássicos: carteira profissional, CPF, comprovante de residência e exames de medicina no trabalho enviados até 3 dias antes do início oficial.", score: 0.95 },
      { id: 2, text: "O período de experiência padrão na empresa é de 90 dias, em total conformidade com a legislação laboral vigente.", score: 0.88 }
    ]},
    { id: 'politica_ferias_clt', name: 'Regulamento de Férias e Licenças.docx', type: 'Documento Office', size: '840 KB', chunks: [
      { id: 1, text: "A solicitação de gozo de férias precisa ser submetida com no mínimo 30 dias de antecedência através do portal do colaborador Sólides.", score: 0.98 },
      { id: 2, text: "As férias podem ser divididas em períodos, contanto que um deles não seja inferior a 14 dias seguidos, salvaguardando o período mínimo legal.", score: 0.91 }
    ]},
    { id: 'politica_reembolso_viagem', name: 'FAQ Política de Reembolsos', type: 'FAQ Extraído (Web)', size: '12 Chunks', chunks: [
      { id: 1, text: "O reembolso de quilometragem/combustível é de R$ 1,80 por KM rodado mediante apresentação do relatório de trajeto aprovado pelo gestor.", score: 0.99 },
      { id: 2, text: "Despesas de refeição em viagens comerciais possuem o limite diário padrão de R$ 75,00 sem necessidade de aprovação prévia excepcional.", score: 0.84 }
    ]}
  ]);

  // Alertas customizados configurados pelo usuário
  const [customAlerts, setCustomAlerts] = useState([
    { id: 'alert_1', name: 'Falta de Registro de Ponto', trigger: 'Colaborador sem marcação de ponto hoje', agentId: 'paulo', channel: 'Slack', template: 'Olá {colaborador}, notamos que você não registrou o seu ponto de entrada hoje ({data}). Por favor, acesse o portal Sólides para regularizar.', active: true },
    { id: 'alert_2', name: 'Férias Próximas ao Vencimento CLT', trigger: 'Férias vencendo em menos de 30 dias', agentId: 'paulo', channel: 'WhatsApp Oficial', template: 'Atenção {gestor}! As férias do colaborador {colaborador} estão a menos de 30 dias do vencimento limite. Por favor, programe o gozo.', active: true },
    { id: 'alert_3', name: 'Lembrete de Profiler Pendente', trigger: 'Candidato com teste pendente no funil', agentId: 'rita', channel: 'E-mail', template: 'Olá {colaborador}, para prosseguir no processo seletivo da vaga {vaga}, preencha o seu teste comportamental Profiler neste link.', active: true }
  ]);

  // Alertas e Skills acoplados do ecossistema
  const [customSkills, setCustomSkills] = useState([
    { id: 'medical_certificate_ocr', name: 'Validador de Atestado Médico (OCR)', type: 'Skill Funcional', desc: 'Lê arquivos de atestado, extrai o CID e valida no DP.' },
    { id: 'profiler_disc_analyzer', name: 'Analisador Profiler Sênior', type: 'Skill Comportamental', desc: 'Interpreta testes comportamentais Sólides DISC.' }
  ]);

  // Visualizador e Busca de RAG focado
  const [selectedRagForInspection, setSelectedRagForInspection] = useState(null);
  const [ragSearchQuery, setRagSearchQuery] = useState('');
  const [ragSearchResults, setRagSearchResults] = useState([]);

  // Estados para WhatsApp Connection Workflow
  const [whatsAppConnected, setWhatsAppConnected] = useState(false);
  const [whatsAppNumber, setWhatsAppNumber] = useState('');
  const [showWhatsAppWizard, setShowWhatsAppWizard] = useState(false);
  const [whatsAppStep, setWhatsAppStep] = useState(1); 

  // Estados para Cadastro de Nova Integração (Hub de APIs, Bancos e Alertas)
  const [showIntegrationWizard, setShowIntegrationWizard] = useState(false);
  const [integrationType, setIntegrationType] = useState('api'); 
  const [integrationStep, setIntegrationStep] = useState(1); 

  const [showAlertWizard, setShowAlertWizard] = useState(false);
  const [newAlertName, setNewAlertName] = useState('');
  const [newAlertTrigger, setNewAlertTrigger] = useState('Colaborador sem marcação de ponto hoje');
  const [newAlertAgent, setNewAlertAgent] = useState('paulo');
  const [newAlertChannel, setNewAlertChannel] = useState('Slack');
  const [newAlertTemplate, setNewAlertTemplate] = useState('Olá {colaborador}, notamos uma inconsistência...');
  
  // Form de API
  const [apiName, setApiName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiAuthType, setApiAuthType] = useState('Bearer Token');
  
  // Form de Banco de dados
  const [dbName, setDbName] = useState('');
  const [dbEngine, setDbEngine] = useState('PostgreSQL');
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('5432');
  const [dbUser, setDbUser] = useState('');

  // Form de RAG / Extrator de FAQs
  const [ragName, setRagName] = useState('');
  const [ragSourceType, setRagSourceType] = useState('url'); 
  const [ragUrlInput, setRagUrlInput] = useState('');
  const [ragAutoChunk, setRagAutoChunk] = useState(true);

  const [testingConnection, setTestingConnection] = useState(false);
  const [testLogs, setTestLogs] = useState([]);

  // Estados para Simulação de Chat / Logs Agentic
  const [chatMessages, setChatMessages] = useState([
    { sender: 'agent', text: 'Olá! Sou o Paulo, seu assistente de Departamento Pessoal. Tenho acesso ao saldo de férias, controle de registros de ponto e holerites, além de conseguir consultar dados das suas bases de dados e políticas RAG ativas. Como posso ajudar hoje?', time: '09:25' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [agentLogs, setAgentLogs] = useState([
    { type: 'info', text: 'Agente Paulo iniciado sob protocolo MCP Sólides v2.5' },
    { type: 'info', text: 'Bases RAG mapeadas semânticamente: "Regulamento de Férias e Licenças.docx" (32 Chunks)' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Trocar de agente selecionado no chat
  const handleSelectAgentForChat = (agent) => {
    setSelectedChatAgent(agent);
    setChatMessages([
      { sender: 'agent', text: `Olá! Sou o(a) ${agent.name}. Atuo como ${agent.role}. Como posso ajudar hoje com as minhas ferramentas integradas?`, time: 'Agora' }
    ]);
    addLog('system', `Foco de conversação alterado para o agente: ${agent.name}`);
  };

  // Helper para adicionar Logs no terminal de demonstração
  const addLog = (type, text) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAgentLogs(prev => [{ type, text, time }, ...prev]);
  };

  // Simular processo de decisão de agente (Fluxo Agêntico completo)
  const handleSendMessage = (textToSend) => {
    if (!textToSend.trim()) return;

    const userMsg = { sender: 'user', text: textToSend, time: 'Agora' };
    setChatMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    addLog('user', `Mensagem recebida do usuário: "${textToSend}"`);

    setTimeout(() => {
      addLog('thinking', `${selectedChatAgent.name} está analisando as ferramentas de dados e fontes RAG ativas...`);
      
      setTimeout(() => {
        const textLower = textToSend.toLowerCase();

        // Cenário de RAG (Busca semântica em FAQ/Políticas da empresa)
        if (textLower.includes('política') || textLower.includes('politica') || textLower.includes('reembolso') || textLower.includes('combustível') || textLower.includes('regras')) {
          addLog('mcp-call', `Acionando Busca Semântica na Base Vetorial RAG: query="${textToSend}"`);
          
          setTimeout(() => {
            addLog('db-query', `Vector Similarity Search no Supabase (Cosseno > 0.81)`);
            addLog('db-response', `Chunk encontrado: [FAQ_Reembolso_Viagem] "O valor do reembolso de quilometragem/combustível é de R$ 1,80 por KM rodado mediante apresentação de relatório gerado de rotas aprovado pelo gestor." (Score: 0.99)`);
            
            setTimeout(() => {
              setChatMessages(prev => [...prev, {
                sender: 'agent',
                text: `Encontrei a resposta na nossa Base de Conhecimento (RAG) integrada. O valor fixado para reembolso de quilometragem é de **R$ 1,80 por KM rodado**, sendo obrigatório anexar o relatório do trajeto no portal Sólides. Quer que eu prepare o lançamento?`,
                time: 'Agora'
              }]);
              addLog('success', `Resposta gerada usando RAG (Retrieved Chunk ID: chunk_reembolso_01). Citação incluída.`);
              setIsTyping(false);
            }, 800);
          }, 1000);

        // Cenário de API/Ponto ou Férias
        } else if (textLower.includes('férias') || textLower.includes('ferias') || textLower.includes('saldo')) {
          addLog('mcp-call', `Encontrada Tool nativa: 'buscar_saldo_ferias(cpf: "299.382.111-01")'`);
          
          setTimeout(() => {
            addLog('mcp-response', `Dados retornados do banco Sólides: { colaborador: "Mariana Souza", saldo: "22 dias", periodo_aquisitivo: "2025/2026" }`);
            
            setTimeout(() => {
              setChatMessages(prev => [...prev, {
                sender: 'agent',
                text: `Consultei os nossos registros de Departamento Pessoal na Sólides. A Mariana Souza possui atualmente **22 dias de férias** de saldo referentes ao período aquisitivo de 2025/2026. Deseja iniciar a solicitação de gozo?`,
                time: 'Agora'
              }]);
              addLog('success', `Resposta gerada usando o resultado da Tool 'buscar_saldo_ferias'.`);
              setIsTyping(false);
            }, 800);
          }, 1000);

        // Cenário de Mapeamento comportamental
        } else if (textLower.includes('profiler') || textLower.includes('perfil')) {
          addLog('mcp-call', `Encontrada Tool nativa: 'consultar_profiler(cpf: "123.882.910-99")'`);
          
          setTimeout(() => {
            addLog('mcp-response', `Dados comportamentais do Profiler Sólides: { perfil: "Comunicador-Executor", dominancia: "78%", influencia: "85%" }`);
            
            setTimeout(() => {
              setChatMessages(prev => [...prev, {
                sender: 'agent',
                text: `De acordo com o mapeamento comportamental Profiler da Sólides, o colaborador possui um perfil de **Comunicador-Executor** (Influência: 85% / Dominância: 78%). Uma pessoa focada em resultados rápidos, carismática e com forte capacidade de liderança por influência.`,
                time: 'Agora'
              }]);
              addLog('success', `Resposta sintetizada combinando perfil comportamental da Sólides.`);
              setIsTyping(false);
            }, 800);
          }, 1000);

        // Resposta padrão
        } else {
          addLog('agent-internal', `Nenhuma ferramenta ou chunk de alta relevância encontrado. Gerando raciocínio genérico.`);
          
          setTimeout(() => {
            setChatMessages(prev => [...prev, {
              sender: 'agent',
              text: `Entendi o seu ponto. Como seu agente especializado, posso disparar fluxos com base em suas APIs registradas, consultas no banco do cliente ou realizar buscas semânticas em documentos de políticas internas (RAG). Me dê um comando específico para ver os logs!`,
              time: 'Agora'
            }]);
            addLog('success', `Resposta puramente textual gerada.`);
            setIsTyping(false);
          }, 800);
        }

      }, 1000);
    }, 500);
  };

  // Criação de Agente customizado via Agent Studio
  const handleCreateAgent = (newAgentData) => {
    const createdAgent = {
      id: `custom_${Date.now()}`,
      name: newAgentData.name,
      role: newAgentData.role,
      desc: newAgentData.desc,
      prompt: newAgentData.prompt,
      mcps: newAgentData.mcps,
      ragSources: newAgentData.ragSources,
      channels: newAgentData.channels,
      source: 'Criado Internamente'
    };
    
    setMyAgents(prev => [...prev, createdAgent]);
    addLog('system', `Novo Agente Customizado Criado: ${createdAgent.name} (${createdAgent.role})`);
    setCurrentView('my-agents');
  };

  // Concluir Conexão WhatsApp
  const handleFinishWhatsAppConnection = (number) => {
    setWhatsAppNumber(number);
    setWhatsAppConnected(true);
    setShowWhatsAppWizard(false);
    setWhatsAppStep(1);
    addLog('integration', `Canal WhatsApp conectado ao número comercial ${number}`);
  };

  // Simulação de Teste de Conexão (API, Banco ou Extrator de RAG)
  const runTestConnection = () => {
    setTestingConnection(true);
    setTestLogs([]);
    const logs = [];

    const appendTestLog = (msg) => {
      logs.push(msg);
      setTestLogs([...logs]);
    };

    if (integrationType === 'api') {
      setTimeout(() => {
        appendTestLog(`🌐 Estabelecendo handshake de transporte com: ${apiUrl || 'https://api.empresa.com'}`);
        setTimeout(() => {
          appendTestLog(`🔑 Verificando método de autorização: Bearer Token`);
          appendTestLog(`🔒 Encriptação SSL TLS 1.3 estabelecida de ponta a ponta.`);
          setTimeout(() => {
            appendTestLog(`📊 Analisando schemas expostos (Auto-discovery MCP)...`);
            setTimeout(() => {
              appendTestLog(`✨ Sucesso! Servidor de API conectado. Métodos expostos: 'consultar_financeiro()', 'adicionar_colaborador_erp()'`);
              setTestingConnection(false);
            }, 850);
          }, 800);
        }, 800);
      }, 300);
    } else if (integrationType === 'db') {
      setTimeout(() => {
        appendTestLog(`🔌 Abrindo socket seguro TCP/IP no Host: ${dbHost || 'localhost'} na Porta: 5432`);
        setTimeout(() => {
          appendTestLog(`🛡️ Autenticação estabelecida com o banco de dados réplica.`);
          appendTestLog(`🗄️ Mapeando Tabelas expostas no schema public...`);
          setTimeout(() => {
            appendTestLog(`✨ Sucesso! Tabelas prontas para uso: 'colaboradores_dw', 'reembolsos_solicitados'`);
            setTestingConnection(false);
          }, 850);
        }, 800);
      }, 300);
    } else {
      /* EXTRAÇÃO DE RAG (WIZARD DE INTELIGÊNCIA VETORIAL) */
      setTimeout(() => {
        appendTestLog(`📖 Iniciando Extrator Inteligente Sólides RAG...`);
        if (ragSourceType === 'url') {
          appendTestLog(`🌐 Varrendo portal de documentações (Web Scraper): ${ragUrlInput || 'https://ajuda.empresa.com'}`);
        } else {
          appendTestLog(`📄 Carregando documento binário para processamento local na Sólides.`);
        }
        
        setTimeout(() => {
          appendTestLog(`⚡ Rodando quebra inteligente de conteúdo (Semantic Chunking - 500 caracteres max, overlap 10%)`);
          appendTestLog(`🤖 Convertendo blocks de texto em representações matemáticas (Model: text-embedding-004)...`);
          
          setTimeout(() => {
            appendTestLog(`📦 Vetores salvos no Vector Database Sólides com sucesso.`);
            appendTestLog(`✨ Sucesso! 42 Chunks criados e prontos para busca semântica.`);
            setTestingConnection(false);
          }, 1200);
        }, 850);
      }, 300);
    }
  };

  // Concluir Conexão de API, Banco de Dados ou RAG
  const handleSaveIntegration = () => {
    if (integrationType === 'api') {
      const newApi = {
        id: `api_${Date.now()}`,
        name: apiName || 'API Nova Conexão',
        url: apiUrl || 'https://api.empresa.com/v1',
        authType: apiAuthType,
        status: 'connected'
      };
      setCustomApis(prev => [...prev, newApi]);
      addLog('system', `Nova API registrada no Hub: ${newApi.name}`);
    } else if (integrationType === 'db') {
      const newDb = {
        id: `db_${Date.now()}`,
        name: dbName || 'Banco de Dados Interno',
        engine: dbEngine,
        host: dbHost || 'localhost',
        status: 'connected'
      };
      setCustomDbs(prev => [...prev, newDb]);
      addLog('system', `Novo Banco de Dados cadastrado: ${newDb.name} (${newDb.engine})`);
    } else {
      const newRag = {
        id: `rag_${Date.now()}`,
        name: ragName || (ragSourceType === 'url' ? 'FAQ Portal de Ajuda' : 'Documento Carregado.pdf'),
        type: ragSourceType === 'url' ? 'FAQ Extraído (Web)' : 'Documento PDF',
        size: ragSourceType === 'url' ? '42 Chunks' : '1.8 MB',
        chunks: [
          { id: 1, text: "Conteúdo recém-extraído e fragmentado automaticamente para busca semântica.", score: 0.99 },
          { id: 2, text: "Nossa tecnologia dividiu este material em blocks de até 500 caracteres utilizando algoritmos semânticos.", score: 0.85 }
        ]
      };
      setCustomRags(prev => [...prev, newRag]);
      addLog('system', `Nova Base de Conhecimento RAG ativa: ${newRag.name}`);
    }

    setShowIntegrationWizard(false);
    setIntegrationStep(1);
    setApiName(''); setApiUrl(''); setDbName(''); setDbHost(''); setRagName(''); setRagUrlInput('');
  };

  // Adicionar Habilidade customizada criada pelo usuário no novo builder
  const handleSaveCustomSkill = (newSkill) => {
    setCustomSkills(prev => [newSkill, ...prev]);
    addLog('system', `Nova Habilidade ativada no catálogo: ${newSkill.name}`);
  };

  const handleDeleteCustomSkill = (id) => {
    setCustomSkills(prev => prev.filter(sk => sk.id !== id));
    addLog('system', `Habilidade de ID: ${id} removida do catálogo.`);
  };

  // Criar novo Alerta
  const handleSaveAlert = () => {
    if (!newAlertName || !newAlertTemplate) return;
    const newAlert = {
      id: `alert_${Date.now()}`,
      name: newAlertName,
      trigger: newAlertTrigger,
      agentId: newAlertAgent,
      channel: newAlertChannel,
      template: newAlertTemplate,
      active: true
    };
    setCustomAlerts(prev => [newAlert, ...prev]);
    setShowAlertWizard(false);
    addLog('system', `Novo Alerta agendado e ativo: ${newAlert.name}`);
    
    // Limpar campos
    setNewAlertName('');
    setNewAlertTemplate('Olá {colaborador}, notamos uma inconsistência...');
  };

  // Deletar Alerta
  const handleDeleteAlert = (id) => {
    setCustomAlerts(prev => prev.filter(al => al.id !== id));
    addLog('system', `Alerta de ID: ${id} removido da rotina.`);
  };

  // Alternar Status Ativo/Inativo do Alerta
  const handleToggleAlertActive = (id) => {
    setCustomAlerts(prev => prev.map(al => {
      if (al.id === id) {
        const nextStatus = !al.active;
        addLog('system', `Alerta '${al.name}' foi ${nextStatus ? 'Ativado' : 'Desativado'} para rotinas futures.`);
        return { ...al, active: nextStatus };
      }
      return al;
    }));
  };

  // Simular busca RAG na tela de Gerenciamento de RAG
  const simulateRagSearch = () => {
    if (!ragSearchQuery) return;
    const allChunks = [];
    customRags.forEach(rag => {
      rag.chunks.forEach(chunk => {
        allChunks.push({
          ragName: rag.name,
          text: chunk.text,
          score: (Math.random() * (0.99 - 0.75) + 0.75).toFixed(2)
        });
      });
    });
    allChunks.sort((a, b) => b.score - a.score);
    setRagSearchResults(allChunks);
  };

  // Excluir integrações para testes da demo
  const handleDeleteApi = (id) => {
    setCustomApis(prev => prev.filter(api => api.id !== id));
    addLog('system', `API de ID: ${id} foi desvinculada.`);
  };

  const handleDeleteDb = (id) => {
    setCustomDbs(prev => prev.filter(db => db.id !== id));
    addLog('system', `Banco de dados ID: ${id} foi desvinculado.`);
  };

  const handleDeleteRag = (id) => {
    setCustomRags(prev => prev.filter(rag => rag.id !== id));
    addLog('system', `Base RAG de ID: ${id} foi deletada.`);
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] font-sans text-slate-800 overflow-hidden select-none">
      
      {/* SIDEBAR CENTRAL SÓLIDES */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-10 flex-shrink-0 font-sans">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md">S</div>
            <div>
              <h1 className="font-bold text-purple-900 leading-tight text-base font-sans">sólides</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold font-sans">Agent Hub</p>
            </div>
          </div>
          <span className="bg-purple-100 text-purple-700 text-[9px] font-bold px-2 py-0.5 rounded-full font-sans">v2.5</span>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto font-sans">
          <p className="text-xs font-bold text-slate-400 mb-2 mt-2 px-2 tracking-wider font-sans">CANAIS DE INTERAÇÃO</p>
          <NavItem 
            icon={<MessageSquare size={18} />} 
            label="Conversar com RH" 
            active={currentView === 'chat'} 
            onClick={() => setCurrentView('chat')} 
          />
          
          <p className="text-xs font-bold text-slate-400 mb-2 mt-6 px-2 tracking-wider font-sans">FORÇA DE TRABALHO DIGITAL</p>
          <NavItem 
            icon={<Bot size={18} />} 
            label={`Meus Agentes (${myAgents.length})`} 
            active={currentView === 'my-agents'} 
            onClick={() => setCurrentView('my-agents')} 
          />
          <NavItem 
            icon={<Store size={18} />} 
            label="Agent Store" 
            active={currentView === 'store'} 
            onClick={() => setCurrentView('store')} 
          />
          <NavItem 
            icon={<Plus size={18} />} 
            label="Criar Novo Agente (Studio)" 
            active={currentView === 'studio'} 
            onClick={() => setCurrentView('studio')} 
          />
          <NavItem 
            icon={<Award size={18} className="text-purple-600" />} 
            label={`Minhas Skills (${customSkills.length + INITIAL_SKILLS.length})`} 
            active={currentView === 'manage-skills'} 
            onClick={() => setCurrentView('manage-skills')} 
          />
          <NavItem 
            icon={<Bell size={18} className="text-amber-500 animate-pulse animate-duration-1000" />} 
            label={`Alertas Agênticos (${customAlerts.length})`} 
            active={currentView === 'manage-alerts'} 
            onClick={() => setCurrentView('manage-alerts')} 
          />

          <p className="text-xs font-bold text-slate-400 mb-2 mt-6 px-2 tracking-wider font-sans">INTEGRAÇÕES ATIVAS (CLIQUE PARA VER)</p>
          
          <button 
            onClick={() => setShowWhatsAppWizard(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors border border-transparent font-sans"
          >
            <div className="flex items-center space-x-3 font-sans">
              <Smartphone size={16} className={whatsAppConnected ? "text-green-600 animate-bounce" : "text-slate-400"} />
              <span className="font-medium text-slate-700 font-sans">WhatsApp Oficial</span>
            </div>
            {whatsAppConnected ? (
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse font-sans"></span>
            ) : (
              <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded font-sans">Setup</span>
            )}
          </button>

          <button 
            onClick={() => setCurrentView('manage-apis')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors border border-transparent font-sans ${
              currentView === 'manage-apis' ? 'bg-purple-100 text-purple-700 font-bold font-sans' : 'text-slate-600 hover:bg-slate-100 font-sans'
            }`}
          >
            <div className="flex items-center space-x-3 font-sans font-sans">
              <Globe size={16} className="text-purple-600" />
              <span className="font-medium text-slate-700 font-sans">APIs Conectadas</span>
            </div>
            <span className="bg-purple-100 text-purple-700 font-mono text-[10px] px-1.5 py-0.5 rounded-full font-sans">{customApis.length}</span>
          </button>

          <button 
            onClick={() => setCurrentView('manage-dbs')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors border border-transparent font-sans ${
              currentView === 'manage-dbs' ? 'bg-blue-100 text-blue-700 font-bold font-sans' : 'text-slate-600 hover:bg-slate-100 font-sans font-sans'
            }`}
          >
            <div className="flex items-center space-x-3 font-sans font-sans">
              <Database size={16} className="text-blue-600" />
              <span className="font-medium text-slate-700 font-sans">Bancos de Dados</span>
            </div>
            <span className="bg-blue-100 text-blue-700 font-mono text-[10px] px-1.5 py-0.5 rounded-full font-sans">{customDbs.length}</span>
          </button>

          <button 
            onClick={() => setCurrentView('manage-rags')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors border border-transparent font-sans ${
              currentView === 'manage-rags' ? 'bg-emerald-100 text-emerald-700 font-bold font-sans font-sans' : 'text-slate-600 hover:bg-slate-100 font-sans'
            }`}
          >
            <div className="flex items-center space-x-3 font-sans">
              <BookOpen size={16} className="text-emerald-600" />
              <span className="font-medium text-slate-700 font-sans font-sans">Bases RAG / FAQ</span>
            </div>
            <span className="bg-emerald-100 text-emerald-700 font-mono text-[10px] px-1.5 py-0.5 rounded-full font-sans font-sans">{customRags.length}</span>
          </button>

          <p className="text-xs font-bold text-slate-400 mb-2 mt-6 px-2 tracking-wider font-sans">MÓDULOS TRADICIONAIS</p>
          <NavItem icon={<Users size={18} />} label="Colaboradores" disabled />
          <NavItem icon={<FileText size={18} />} label="Admissões" disabled />
          <NavItem icon={<Settings size={18} />} label="Configurações" disabled />
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50 font-sans">
          <div className="flex items-center space-x-2 font-sans">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse font-sans"></span>
            <span className="text-xs font-semibold text-slate-600 font-sans">Sólides Orquestrador Ativo</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 font-sans">Sincronizado com regras CLT vigentes.</p>
        </div>
      </aside>

      {/* PAINEL CENTRAL DINÂMICO */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* CABEÇALHO DO TOPO */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10 flex-shrink-0 font-sans">
          <div className="flex items-center space-x-4">
            {currentView === 'chat' && (
              <div className="flex items-center space-x-3 font-sans">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide font-sans">Falar com:</span>
                <div className="relative group font-sans">
                  <select 
                    value={selectedChatAgent.id} 
                    onChange={(e) => {
                      const found = myAgents.find(a => a.id === e.target.value);
                      if (found) handleSelectAgentForChat(found);
                    }}
                    className="appearance-none bg-purple-50 text-purple-700 px-4 py-1.5 pr-8 rounded-full text-sm font-semibold hover:bg-purple-100 transition-colors focus:outline-none cursor-pointer border border-transparent font-sans"
                  >
                    {myAgents.map(a => (
                      <option key={a.id} value={a.id}>{a.name} - {a.role}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-700 pointer-events-none" />
                </div>

                {/* BOTÃO PARA ALTERNAR VISIBILIDADE DO TERMINAL */}
                <button 
                  onClick={() => setShowTerminal(!showTerminal)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    showTerminal 
                      ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' 
                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  }`}
                  title="Mostrar/Ocultar Terminal de Execução"
                >
                  <Terminal size={13} className={showTerminal ? "text-purple-600 animate-pulse" : "text-slate-500"} />
                  <span>{showTerminal ? 'Ocultar Terminal' : 'Mostrar Terminal'}</span>
                </button>
              </div>
            )}
            {currentView === 'store' && <h2 className="font-bold text-slate-800 flex items-center space-x-2"><Store size={18} className="text-purple-600" /> <span>Agent Store da Sólides</span></h2>}
            {currentView === 'studio' && <h2 className="font-bold text-slate-800 flex items-center space-x-2"><Plus size={18} className="text-purple-600" /> <span>Agent Studio (Construtor)</span></h2>}
            {currentView === 'my-agents' && <h2 className="font-bold text-slate-800 flex items-center space-x-2"><Bot size={18} className="text-purple-600" /> <span>Sua Força de Trabalho Digital</span></h2>}
            {currentView === 'manage-apis' && <h2 className="font-bold text-slate-800 flex items-center space-x-2"><Globe size={18} className="text-purple-600" /> <span>Gerenciador de APIs Conectadas (MCP)</span></h2>}
            {currentView === 'manage-dbs' && <h2 className="font-bold text-slate-800 flex items-center space-x-2"><Database size={18} className="text-blue-600" /> <span>Gerenciador de Bancos de Dados</span></h2>}
            {currentView === 'manage-rags' && <h2 className="font-bold text-slate-800 flex items-center space-x-2"><BookOpen size={18} className="text-emerald-600" /> <span>Gerenciador de Bases RAG & Extrator FAQ</span></h2>}
            {currentView === 'manage-alerts' && <h2 className="font-bold text-slate-800 flex items-center space-x-2"><Bell size={18} className="text-amber-500 animate-pulse animate-duration-1000" /> <span>Central de Alertas Agênticos Automatizados</span></h2>}
            {currentView === 'manage-skills' && <h2 className="font-bold text-slate-800 flex items-center space-x-2"><Award size={18} className="text-purple-600" /> <span>Minhas Habilidades Operacionais (Skills OpenClaw)</span></h2>}
          </div>
          
          <div className="flex items-center space-x-4 text-sm font-sans">
            {whatsAppConnected && (
              <div className="flex items-center space-x-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium font-sans">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full font-sans"></span>
                <span>WhatsApp Ativo ({whatsAppNumber})</span>
              </div>
            )}
            <div className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
              <span className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs font-sans">EL</span>
              <span className="font-medium text-slate-700 font-sans">Empresa Demo LTDA</span>
            </div>
          </div>
        </header>

        {/* CONTAINER DO CONTEÚDO PRINCIPAL (DIFERENTES VIEWS) */}
        <div className="flex-1 overflow-hidden flex flex-col font-sans">
          {currentView === 'chat' && (
            <div className="flex-1 flex overflow-hidden font-sans">
              
              {/* LADO DO CHAT */}
              <div className="flex-1 flex flex-col bg-white font-sans">
                
                {/* Janela de Histórico */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 flex items-start space-x-3 text-xs text-purple-800 max-w-2xl mx-auto font-sans">
                    <Info className="flex-shrink-0 mt-0.5 animate-bounce" size={16} />
                    <div>
                      <p className="font-bold font-sans">Painel de Demonstração Interativa Sólides:</p>
                      <p className="mt-0.5 leading-relaxed font-sans">Teste a tomada de decisão autônoma do seu agente, consultas RAG de políticas internas e simule alertas automáticos de rotina que disparam em múltiplos canais. Use o botão acima para fechar ou abrir o terminal.</p>
                    </div>
                  </div>

                  <div className="max-w-2xl mx-auto space-y-4 pt-4 font-sans font-sans">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start font-sans'}`}>
                        <div className={`flex items-start space-x-2 max-w-[80%] ${msg.sender === 'user' ? 'flex-row-reverse space-x-reverse font-sans' : 'font-sans'}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs ${
                            msg.sender === 'user' ? 'bg-slate-600 text-white' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {msg.sender === 'user' ? 'EU' : selectedChatAgent.name[0]}
                          </div>
                          <div>
                            <div className={`p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                              msg.sender === 'user' 
                                ? 'bg-purple-600 text-white rounded-tr-none font-sans' 
                                : 'bg-slate-100 text-slate-800 rounded-tl-none font-sans'
                            }`}>
                              {msg.text}
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1 block px-1 font-sans">{msg.time}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-start animate-pulse font-sans">
                        <div className="flex items-center space-x-2 bg-slate-100 p-3 rounded-2xl rounded-tl-none text-xs text-slate-500 shadow-sm font-sans">
                          <span className="animate-bounce font-sans">●</span>
                          <span className="animate-bounce delay-100 font-sans font-sans font-sans">●</span>
                          <span className="animate-bounce delay-200 font-sans font-sans font-sans">●</span>
                          <span>{selectedChatAgent.name} está rodando busca semântica em RAG...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Caixa de Entrada e Roteiros Rápidos */}
                <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex-shrink-0 font-sans">
                  <div className="max-w-2xl mx-auto space-y-3 font-sans">
                    
                    {/* Roteiros Rápidos para a Apresentação */}
                    <div className="flex flex-wrap items-center gap-2 font-sans">
                      <span className="text-xs font-semibold text-slate-400 flex items-center space-x-1 font-sans">
                        <Sparkles size={12} className="text-purple-600 animate-pulse font-sans" />
                        <span>Comandos Rápidos:</span>
                      </span>
                      <button 
                        onClick={() => handleSendMessage("Qual a política de reembolso para combustível?")}
                        className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-full hover:border-emerald-300 hover:bg-emerald-100 transition-colors shadow-sm flex items-center space-x-1 font-semibold"
                      >
                        <span>📖 Busca RAG (Políticas de Reembolso)</span>
                      </button>
                      <button 
                        onClick={() => handleSendMessage("Qual o saldo de férias de Mariana Souza?")}
                        className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:border-purple-300 hover:text-purple-700 hover:bg-purple-50 transition-colors shadow-sm flex items-center space-x-1 font-medium font-sans font-sans"
                      >
                        <span>📊 Férias Sólides</span>
                      </button>
                      <button 
                        onClick={() => handleSendMessage("Consultar perfil comportamental no Profiler")}
                        className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:border-purple-300 hover:text-purple-700 hover:bg-purple-50 transition-colors shadow-sm flex items-center space-x-1 font-medium font-sans"
                      >
                        <span>🧬 Profiler Sólides</span>
                      </button>
                    </div>

                    <div className="bg-white shadow-sm border border-slate-200 rounded-full flex items-center p-1.5 px-4 transition-shadow focus-within:shadow-md focus-within:border-purple-300">
                      <input 
                        type="text" 
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
                        placeholder={`Pergunte algo para ${selectedChatAgent.name}...`}
                        className="flex-1 outline-none text-slate-700 py-1.5 bg-transparent text-sm font-sans"
                      />
                      <div className="flex items-center space-x-1 text-slate-400">
                        <button className="p-2 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors" title="Anexar documento de contexto"><Paperclip size={18} /></button>
                        <button className="p-2 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors" title="Gravar voz"><Mic size={18} /></button>
                        <button 
                          onClick={() => handleSendMessage(inputValue)}
                          className="bg-purple-600 text-white p-2 rounded-full hover:bg-purple-700 transition-colors shadow-sm"
                        >
                          <Send size={18} className="ml-0.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* LADO DIREITO: AGENT CONSOLE (RENDERIZADO CONDICIONALMENTE) */}
              {showTerminal && (
                <div className="w-80 border-l border-slate-200 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 font-mono text-[11px] h-full overflow-hidden transition-all">
                  <div className="p-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between font-mono font-mono">
                    <div className="flex items-center space-x-2">
                      <Terminal size={14} className="text-purple-400 animate-pulse font-mono" />
                      <span className="font-bold text-slate-200 font-mono">Terminal de Execução MCP</span>
                    </div>
                    <button 
                      onClick={() => setAgentLogs([{ type: 'system', text: 'Console limpo pelo demonstrador.', time: 'Agora' }])}
                      className="text-[9px] text-slate-500 hover:text-slate-300 bg-slate-800 px-2 py-0.5 rounded transition-colors font-mono"
                    >
                      CLEAR
                    </button>
                  </div>
                  
                  <div className="p-3 bg-slate-950 border-b border-slate-800 text-slate-400 space-y-1 col-span-1">
                    <p className="text-amber-400 font-bold font-mono">🔍 Conexões Ativas do Agente {selectedChatAgent.name}:</p>
                    <div className="flex flex-wrap gap-1 mt-1 font-mono">
                      {selectedChatAgent.mcps.map(mcpId => (
                        <span key={mcpId} className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[9px] text-purple-300 font-semibold font-mono">
                          {mcpId}()
                        </span>
                      ))}
                      {selectedChatAgent.ragSources && selectedChatAgent.ragSources.map(ragId => (
                        <span key={ragId} className="bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 rounded text-[9px] text-emerald-400 font-semibold font-mono">
                          rag_{ragId}()
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono">
                    {agentLogs.length === 0 ? (
                      <div className="text-slate-600 italic text-center pt-8 font-sans">Aguardando interações...</div>
                    ) : (
                      agentLogs.map((log, idx) => (
                        <div key={idx} className="space-y-0.5 leading-relaxed font-mono">
                          <div className="flex items-center justify-between text-slate-500 text-[9px] font-mono">
                            <span>[{log.time || 'Processando'}]</span>
                            <span className={`px-1 rounded uppercase font-bold text-[8px] font-mono ${
                              log.type === 'mcp-call' ? 'bg-purple-950 text-purple-400' :
                              log.type === 'db-query' ? 'bg-blue-950 text-blue-400' :
                              log.type === 'db-response' ? 'bg-teal-950 text-teal-400' :
                              log.type === 'success' ? 'bg-green-950 text-green-400' :
                              log.type === 'system' ? 'bg-slate-800 text-slate-400' : 'bg-slate-800 text-slate-400'
                            }`}>{log.type}</span>
                          </div>
                          <p className={`font-mono ${
                            log.type === 'mcp-call' ? 'text-purple-300 font-semibold font-mono' :
                            log.type === 'db-query' ? 'text-blue-300 font-mono' :
                            log.type === 'db-response' ? 'text-teal-300' :
                            log.type === 'success' ? 'text-green-400 font-semibold' :
                            log.type === 'user' ? 'text-slate-400 italic' : 'text-slate-300'
                          }`}>{log.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {currentView === 'store' && <StoreView myAgents={myAgents} setMyAgents={setMyAgents} addLog={addLog} />}
          {currentView === 'studio' && <StudioView availableMcps={[...INITIAL_MCPS]} customApis={customApis} customDbs={customDbs} customRags={customRags} customSkills={customSkills} onCreate={handleCreateAgent} />}
          {currentView === 'my-agents' && <MyAgentsView agents={myAgents} onNew={() => setCurrentView('studio')} whatsAppConnected={whatsAppConnected} />}
          
          {/* VIEWS DE GERENCIAMENTO (CORREÇÃO DE BUGS DOS CLIQUES) */}
          {currentView === 'manage-apis' && (
            <ManageApisView 
              apis={customApis} 
              onDelete={handleDeleteApi} 
              onNew={() => { setIntegrationType('api'); setShowIntegrationWizard(true); }}
              addLog={addLog}
            />
          )}

          {currentView === 'manage-dbs' && (
            <ManageDbsView 
              dbs={customDbs} 
              onDelete={handleDeleteDb} 
              onNew={() => { setIntegrationType('db'); setShowIntegrationWizard(true); }}
              addLog={addLog}
            />
          )}

          {currentView === 'manage-rags' && (
            <ManageRagsView 
              rags={customRags} 
              onDelete={handleDeleteRag} 
              onNew={() => { setIntegrationType('rag'); setShowIntegrationWizard(true); }}
              selectedRag={selectedRagForInspection}
              setSelectedRag={setSelectedRagForInspection}
              searchQuery={ragSearchQuery}
              setSearchQuery={setRagSearchQuery}
              searchResults={ragSearchResults}
              onSearch={simulateRagSearch}
              addLog={addLog}
            />
          )}

          {/* VIEW EXCLUSIVA: GERENCIAR ALERTAS */}
          {currentView === 'manage-alerts' && (
            <ManageAlertsView 
              alerts={customAlerts} 
              agents={myAgents}
              onDelete={handleDeleteAlert} 
              onToggleActive={handleToggleAlertActive}
              onNew={() => setShowAlertWizard(true)}
              addLog={addLog}
            />
          )}

          {/* VIEW EXCLUSIVA: GERENCIAR SKILLS (OPENCLAW STYLE - COORDENAÇÃO DE APIs E RAGs PELO USUÁRIO) */}
          {currentView === 'manage-skills' && (
            <ManageSkillsView 
              skills={[...INITIAL_SKILLS, ...customSkills]} 
              customApis={customApis}
              customDbs={customDbs}
              customRags={customRags}
              onDelete={handleDeleteCustomSkill} 
              onNewCustomSkill={handleSaveCustomSkill}
              addLog={addLog}
            />
          )}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* MODAL: CONFIGURAÇÃO DE WHATSAPP */}
      {/* ========================================================================= */}
      {showWhatsAppWizard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200 flex flex-col font-sans">
            
            <div className="bg-purple-700 p-5 text-white flex items-center justify-between font-sans">
              <div className="flex items-center space-x-3 font-sans font-sans">
                <Smartphone className="w-6 h-6" />
                <div>
                  <h3 className="font-bold text-base font-sans text-white">WhatsApp Business API</h3>
                  <p className="text-xs text-purple-100">Atendimento de colaboradores diretamente pelo celular</p>
                </div>
              </div>
              <button onClick={() => { setShowWhatsAppWizard(false); setWhatsAppStep(1); }} className="text-purple-100 hover:text-white">✕</button>
            </div>

            <div className="flex border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 font-sans">
              <div className={`flex-1 py-3 text-center border-b-2 ${whatsAppStep === 1 ? 'border-purple-600 text-purple-700 bg-white font-bold' : 'border-transparent text-slate-400'}`}>1. Telefone</div>
              <div className={`flex-1 py-3 text-center border-b-2 ${whatsAppStep === 2 ? 'border-purple-600 text-purple-700 bg-white font-bold' : 'border-transparent text-slate-400'}`}>2. QR Code</div>
              <div className={`flex-1 py-3 text-center border-b-2 ${whatsAppStep === 3 ? 'border-purple-600 text-purple-700 bg-white font-bold' : 'border-transparent text-slate-400'}`}>3. Pronto!</div>
            </div>

            <div className="p-6 flex-1 bg-white font-sans">
              {whatsAppStep === 1 && (
                <div className="space-y-4 font-sans animate-fade-in font-sans">
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 text-xs text-purple-800 space-y-1">
                    <p className="font-bold flex items-center space-x-1"><Sparkles size={14} /><span>Distribuição Omnichannel</span></p>
                    <p>Qualquer agente que herdar o canal WhatsApp responderá nativamente mensagens recebidas nessa linha comercial.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Telefone Comercial</label>
                    <div className="relative font-sans animate-fade-in">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">+55</span>
                      <input 
                        type="text" 
                        placeholder="(31) 98888-7777" 
                        value={whatsAppNumber}
                        onChange={(e) => setWhatsAppNumber(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg pl-12 pr-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {whatsAppStep === 2 && (
                <div className="flex flex-col items-center justify-center space-y-4 text-center">
                  <p className="text-sm font-semibold text-slate-700 font-medium font-sans">Escaneie o QR Code no WhatsApp do seu DP</p>
                  <div className="border border-slate-200 p-4 rounded-xl bg-slate-50 relative group">
                    <QrCode size={160} className="text-slate-800" />
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-[1px] flex items-center justify-center flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="text-purple-600 mb-1" size={24} />
                      <span className="text-[10px] font-bold text-purple-700 font-sans font-sans">SIMULAR LEITURA</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 font-sans">Aguardando sinal de handshake do gateway comercial Sólides...</p>
                </div>
              )}

              {whatsAppStep === 3 && (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-4 font-sans animate-fade-in font-sans">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold font-sans font-sans font-sans">✓</div>
                  <h4 className="text-lg font-bold text-slate-800 font-sans font-sans font-sans">WhatsApp Conectado!</h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 w-full text-left space-y-2 text-xs font-sans font-sans">
                    <div className="flex justify-between font-sans font-sans"><span className="text-slate-400 font-sans font-sans">Número:</span><span className="font-semibold text-slate-700 font-sans font-sans">+55 {whatsAppNumber}</span></div>
                    <div className="flex justify-between font-sans"><span className="text-slate-400 font-sans font-sans">Canal:</span><span className="font-semibold text-purple-600 font-sans font-sans">WhatsApp Cloud Sólides</span></div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between font-sans">
              {whatsAppStep > 1 && whatsAppStep < 3 && (
                <button onClick={() => setWhatsAppStep(whatsAppStep - 1)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 font-sans">Voltar</button>
              )}
              {whatsAppStep === 1 && (
                <button onClick={() => setWhatsAppStep(2)} disabled={!whatsAppNumber} className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 ml-auto disabled:opacity-50 font-sans">Conectar Linha</button>
              )}
              {whatsAppStep === 2 && (
                <button onClick={() => setWhatsAppStep(3)} className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 ml-auto font-sans font-sans">Simular Leitura QR</button>
              )}
              {whatsAppStep === 3 && (
                <button onClick={() => handleFinishWhatsAppConnection(whatsAppNumber)} className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 w-full animate-pulse font-sans">Finalizar Setup</button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: HUB DE CONEXÕES AVANÇADO */}
      {/* ========================================================================= */}
      {showIntegrationWizard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col font-sans">
            
            <div className="bg-slate-900 p-5 text-white flex items-center justify-between font-sans">
              <div className="flex items-center space-x-3 font-sans">
                {integrationType === 'api' && <Globe className="w-6 h-6 text-purple-400 animate-pulse animate-duration-1000" />}
                {integrationType === 'db' && <Database className="w-6 h-6 text-blue-400 animate-pulse animate-duration-1000" />}
                {integrationType === 'rag' && <BookOpen className="w-6 h-6 text-emerald-400 animate-pulse animate-duration-1000" />}
                <div>
                  <h3 className="font-bold text-base font-sans text-white text-white">
                    {integrationType === 'api' && 'Conectar Nova API / Servidor MCP'}
                    {integrationType === 'db' && 'Conectar Banco de Dados Réplica'}
                    {integrationType === 'rag' && 'Conectar Base RAG com Extrator FAQ'}
                  </h3>
                  <p className="text-xs text-slate-400 font-sans font-sans">Herde esquemas de forma rápida e segura para o orquestrador</p>
                </div>
              </div>
              <button onClick={() => { setShowIntegrationWizard(false); setIntegrationStep(1); }} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 font-sans">
              <div className={`flex-1 py-3 text-center border-b-2 ${integrationStep === 1 ? 'border-purple-600 text-purple-700 bg-white font-bold' : 'border-transparent text-slate-400'}`}>
                1. Mapeamento & Configurações
              </div>
              <div className={`flex-1 py-3 text-center border-b-2 ${integrationStep === 2 ? 'border-purple-600 text-purple-700 bg-white font-bold' : 'border-transparent text-slate-400'}`}>
                2. Teste e Chunking de IA
              </div>
            </div>

            <div className="p-6 flex-1 bg-white overflow-y-auto max-h-[400px] font-sans">
              
              {integrationStep === 1 && (
                <div className="space-y-4 font-sans">
                  {integrationType === 'api' && (
                    <>
                      <div className="grid grid-cols-2 gap-4 font-sans font-sans">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">NOME DA CONEXÃO</label>
                          <input 
                            type="text" 
                            placeholder="Ex: API Senior FP" 
                            value={apiName} 
                            onChange={(e) => setApiName(e.target.value)} 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1 font-sans">AUTENTICAÇÃO</label>
                          <select 
                            value={apiAuthType} 
                            onChange={(e) => setApiAuthType(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-purple-500 focus:outline-none font-sans"
                          >
                            <option>Bearer Token</option>
                            <option>Custom API Key</option>
                            <option>OAuth 2.0 (Client Credentials)</option>
                            <option>Sem Autenticação</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">URL BASE DO SERVIDOR / ENDPOINT</label>
                        <input 
                          type="text" 
                          placeholder="https://api.empresa.com.br/v1" 
                          value={apiUrl}
                          onChange={(e) => setApiUrl(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-none" 
                        />
                      </div>
                    </>
                  )}

                  {integrationType === 'db' && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">NOME DO BANCO</label>
                          <input 
                            type="text" 
                            placeholder="Ex: Oracle DW Replica" 
                            value={dbName} 
                            onChange={(e) => setDbName(e.target.value)} 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">ENGINE DO BANCO</label>
                          <select 
                            value={dbEngine} 
                            onChange={(e) => setDbEngine(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-purple-500 focus:outline-none font-sans"
                          >
                            <option>PostgreSQL</option>
                            <option>MySQL</option>
                            <option>SQL Server (MSSQL)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-sans font-sans">
                        <div className="col-span-2 font-sans">
                          <label className="block text-xs font-bold text-slate-500 mb-1">HOST DE CONEXÃO (RÉPLICA)</label>
                          <input 
                            type="text" 
                            placeholder="replica.dw-empresa.com" 
                            value={dbHost} 
                            onChange={(e) => setDbHost(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-purple-500" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">PORTA</label>
                          <input 
                            type="text" 
                            value={dbPort} 
                            onChange={(e) => setDbPort(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-purple-500" 
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {integrationType === 'rag' && (
                    <>
                      <div className="p-4 bg-emerald-50 border border-emerald-100 text-xs text-emerald-800 rounded-xl space-y-1 font-sans">
                        <p className="font-bold flex items-center space-x-1.5"><Sparkles size={14} /><span>Extrator de Conhecimento RAG Fácil</span></p>
                        <p>Varra automaticamente sua central de ajuda online ou carregue manuais internos da sua empresa.</p>
                      </div>

                      <div className="space-y-4 font-sans font-sans">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1 font-sans">NOME DA BASE DE CONHECIMENTO</label>
                          <input 
                            type="text" 
                            placeholder="Ex: Política de Reembolso Stone" 
                            value={ragName} 
                            onChange={(e) => setRagName(e.target.value)} 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" 
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-2">MÉTODO DE INTEGRAÇÃO</label>
                          <div className="grid grid-cols-3 gap-2 font-sans">
                            <button 
                              type="button" 
                              onClick={() => setRagSourceType('url')}
                              className={`p-3 border rounded-xl text-center flex flex-col items-center justify-center space-y-1 ${ragSourceType === 'url' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-200 hover:bg-slate-50 font-sans font-sans'}`}
                            >
                              <Globe size={18} />
                              <span className="text-[10px] font-bold font-sans">Extrair de URL</span>
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setRagSourceType('pdf')}
                              className={`p-3 border rounded-xl text-center flex flex-col items-center justify-center space-y-1 ${ragSourceType === 'pdf' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-200 hover:bg-slate-50 font-sans font-sans'}`}
                            >
                              <FileSearch size={18} />
                              <span className="text-[10px] font-bold font-sans">Subir Documento</span>
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setRagSourceType('drive')}
                              className={`p-3 border rounded-xl text-center flex flex-col items-center justify-center space-y-1 ${ragSourceType === 'drive' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-200 hover:bg-slate-50 font-sans font-sans'}`}
                            >
                              <Folder size={18} />
                              <span className="text-[10px] font-bold font-sans">GDrive / Notion</span>
                            </button>
                          </div>
                        </div>

                        {ragSourceType === 'url' ? (
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">URL DO PORTAL DE DOCUMENTAÇÃO / FAQ</label>
                            <input 
                              type="text" 
                              placeholder="https://ajuda.stone.co/politicas-reembolso" 
                              value={ragUrlInput}
                              onChange={(e) => setRagUrlInput(e.target.value)}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-emerald-500" 
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 font-sans">ARQUIVOS LOCAIS (PDF, DOCX)</label>
                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer flex flex-col items-center justify-center font-sans">
                              <UploadCloud className="text-slate-400 mb-1 font-sans" size={24} />
                              <span className="text-xs font-bold text-slate-700 font-sans">Selecione seu manual ou PDF comercial</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                </div>
              )}

              {integrationStep === 2 && (
                <div className="space-y-4 font-sans font-sans font-sans">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">Mapeamento de Handshake</p>
                    <button 
                      type="button" 
                      onClick={runTestConnection} 
                      disabled={testingConnection}
                      className="text-xs text-purple-600 font-semibold flex items-center space-x-1 hover:underline disabled:opacity-50 font-sans"
                    >
                      <RefreshCw size={12} className={testingConnection ? "animate-spin" : ""} />
                      <span>Testar Conexão</span>
                    </button>
                  </div>

                  <div className="bg-slate-900 rounded-lg p-4 font-mono text-[10px] text-slate-300 h-52 overflow-y-auto space-y-1.5 border border-slate-800 shadow-inner font-mono">
                    {testLogs.map((log, i) => (
                      <p key={i} className="leading-relaxed font-mono">{log}</p>
                    ))}
                    {testingConnection && (
                      <span className="text-slate-500 animate-pulse block font-sans">Mapeando schemas e gerando chunks semânticos...</span>
                    )}
                  </div>

                  {!testingConnection && testLogs.length > 0 && (
                    <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg border border-green-200 text-xs text-green-800 animate-fade-in font-sans font-sans">
                      <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                      <span>Conexão validada com sucesso!</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between font-sans">
              {integrationStep > 1 && (
                <button onClick={() => setIntegrationStep(integrationStep - 1)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 font-sans font-sans">Voltar</button>
              )}
              
              {integrationStep === 1 && (
                <button 
                  onClick={() => { setIntegrationStep(2); runTestConnection(); }} 
                  className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 ml-auto font-sans"
                >
                  Salvar e Analisar Schemas
                </button>
              )}

              {integrationStep === 2 && (
                <button 
                  onClick={handleSaveIntegration} 
                  disabled={testingConnection}
                  className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 ml-auto disabled:opacity-50 font-sans"
                >
                  Concluir e Adicionar ao Hub
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CRIAR NOVO ALERTA AGÊNTICO */}
      {/* ========================================================================= */}
      {showAlertWizard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200 flex flex-col font-sans">
            
            <div className="bg-amber-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Bell className="w-6 h-6 animate-bounce" />
                <div>
                  <h3 className="font-bold text-base font-sans text-white">Novo Alerta Agêntico Automático</h3>
                  <p className="text-xs text-amber-100 font-sans">Dispare notificações inteligentes baseadas em regras de comportamento</p>
                </div>
              </div>
              <button onClick={() => setShowAlertWizard(false)} className="text-amber-100 hover:text-white">✕</button>
            </div>

            <div className="p-6 flex-1 bg-white space-y-4 font-sans font-sans">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nome do Alerta</label>
                <input 
                  type="text" 
                  placeholder="Ex: Aviso Prévio de Férias do Time"
                  value={newAlertName}
                  onChange={(e) => setNewAlertName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 font-sans">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 font-sans">Gatilho / Evento</label>
                  <select 
                    value={newAlertTrigger}
                    onChange={(e) => setNewAlertTrigger(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-amber-500 focus:outline-none font-sans"
                  >
                    <option>Colaborador sem marcação de ponto hoje</option>
                    <option>Férias vencendo em menos de 30 dias</option>
                    <option>Candidato com teste pendente no funil</option>
                    <option>Inconsistência de escala identificada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 font-sans">Agente Responsável</label>
                  <select 
                    value={newAlertAgent}
                    onChange={(e) => setNewAlertAgent(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-amber-500 focus:outline-none font-sans font-sans"
                  >
                    {myAgents.map(ag => (
                      <option key={ag.id} value={ag.id}>{ag.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 font-sans font-sans font-sans">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 font-sans">Canal de Destino</label>
                  <select 
                    value={newAlertChannel}
                    onChange={(e) => setNewAlertChannel(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-amber-500 focus:outline-none"
                  >
                    <option>Slack</option>
                    <option>WhatsApp Oficial</option>
                    <option>Microsoft Teams</option>
                    <option>E-mail</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 font-sans">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide font-sans">Template da Mensagem</label>
                  <span className="text-[10px] text-slate-400 font-semibold font-mono">Tags: &#123;colaborador&#125; &#123;gestor&#125; &#123;data&#125;</span>
                </div>
                <textarea 
                  rows="3"
                  value={newAlertTemplate}
                  onChange={(e) => setNewAlertTemplate(e.target.value)}
                  placeholder="Olá {colaborador}, tudo bem? Notamos que..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:outline-none font-sans resize-none"
                ></textarea>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between font-sans">
              <button onClick={() => setShowAlertWizard(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 font-sans">Cancelar</button>
              <button 
                onClick={handleSaveAlert}
                disabled={!newAlertName || !newAlertTemplate}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 font-sans"
              >
                Salvar e Ativar Alerta
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}