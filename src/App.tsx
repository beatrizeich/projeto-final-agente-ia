import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Brain,
  Briefcase,
  Check,
  Database,
  FileText,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import type {
  AgentConfig,
  ConversationMode,
  PublicState,
  SkillId,
  SourceType,
} from "../shared/types";
import {
  addFaq,
  addKnowledge,
  deleteFaq,
  deleteKnowledge,
  getState,
  resetChat,
  saveAgent,
  sendChat,
  toggleFaq,
} from "./lib/api";

const MODES: Array<{
  id: ConversationMode;
  label: string;
  icon: typeof Brain;
  temperature: number;
}> = [
  { id: "precise", label: "Preciso", icon: Brain, temperature: 0.2 },
  { id: "friendly", label: "Amigavel", icon: Smile, temperature: 0.7 },
  { id: "formal", label: "Formal", icon: Briefcase, temperature: 0.4 },
];

const SKILLS: Array<{ id: SkillId; label: string }> = [
  { id: "greeting", label: "Saudacao" },
  { id: "faq", label: "FAQ" },
  { id: "escalation", label: "Escalonar" },
  { id: "lead-capture", label: "Leads" },
  { id: "sentiment", label: "Sentimento" },
  { id: "follow-up", label: "Follow-up" },
];

const SOURCE_LABELS: Record<SourceType, string> = {
  document: "Documento",
  manual: "Manual",
  website: "Site",
  social: "Social",
};

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "amber" | "purple" }) {
  const styles = {
    neutral: "border-white/10 bg-white/[0.07] text-slate-300",
    blue: "border-lagoon/25 bg-lagoon/10 text-lagoon",
    green: "border-mint/25 bg-mint/10 text-mint",
    amber: "border-ember/25 bg-ember/10 text-ember",
    purple: "border-plum/25 bg-plum/10 text-plum",
  };

  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold shadow-sm ${styles[tone]}`}>
      {children}
    </span>
  );
}

function App() {
  const [state, setState] = useState<PublicState | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("document");
  const [sourceContent, setSourceContent] = useState("");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    getState()
      .then((data) => {
        setState(data);
        setAgentDraft(data.agent);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const activeFaqs = useMemo(() => state?.faqs.filter((faq) => faq.isActive).length ?? 0, [state]);

  async function handleSaveAgent(event: FormEvent) {
    event.preventDefault();
    if (!agentDraft) return;
    setSaving(true);
    setError(null);
    try {
      const data = await saveAgent(agentDraft);
      setState(data);
      setAgentDraft(data.agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function patchAgent(patch: Partial<AgentConfig>) {
    setAgentDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function toggleSkill(skill: SkillId) {
    if (!agentDraft) return;
    const active = agentDraft.skills.includes(skill);
    patchAgent({
      skills: active
        ? agentDraft.skills.filter((item) => item !== skill)
        : [...agentDraft.skills, skill],
    });
  }

  async function handleKnowledgeSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const data = await addKnowledge({
        sourceName: sourceName.trim(),
        sourceType,
        content: sourceContent.trim(),
      });
      setState(data);
      setSourceName("");
      setSourceContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao indexar");
    }
  }

  async function handleFaqSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const data = await addFaq({ question: faqQuestion, answer: faqAnswer });
      setState(data);
      setFaqQuestion("");
      setFaqAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar FAQ");
    }
  }

  async function handleSendChat(event: FormEvent) {
    event.preventDefault();
    if (!chatInput.trim()) return;
    const message = chatInput.trim();
    setChatInput("");
    setChatLoading(true);
    setError(null);

    const optimisticCustomer = {
      id: `tmp-${Date.now()}`,
      role: "customer" as const,
      content: message,
      createdAt: new Date().toISOString(),
    };
    setState((current) => current ? { ...current, messages: [...current.messages, optimisticCustomer] } : current);

    try {
      await sendChat(message);
      const fresh = await getState();
      setState(fresh);
      setAgentDraft(fresh.agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no chat");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleResetChat() {
    const data = await resetChat();
    setState(data);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setSourceName(file.name);
    setSourceType("document");
    setSourceContent(await file.text());
  }

  if (loading || !state || !agentDraft) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist text-ink">
        <div className="panel flex items-center gap-3 rounded-[24px] px-5 py-4">
          <Loader2 className="h-6 w-6 animate-spin text-lagoon" />
          <span className="text-sm font-bold text-slate-200">Carregando agente</span>
        </div>
      </main>
    );
  }

  const navItems = [
    { href: "#agent-panel", icon: Sparkles, label: "Agente", tone: "text-lagoon" },
    { href: "#knowledge-panel", icon: Database, label: "Conhecimento", tone: "text-mint" },
    { href: "#faq-panel", icon: Check, label: "FAQ", tone: "text-plum" },
    { href: "#chat-panel", icon: MessageCircle, label: "Playground", tone: "text-ember" },
  ];

  return (
    <main className="min-h-screen overflow-hidden px-4 py-4 text-slate-100 sm:px-5 lg:px-6">
      <div className="mx-auto grid max-w-[1680px] gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="panel sticky top-4 hidden h-[calc(100vh-2rem)] flex-col rounded-[28px] p-5 lg:flex">
          <div className="flex items-center gap-3">
            <div className="brand-mark flex h-12 w-12 items-center justify-center rounded-2xl text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">O Agente Local</p>
              <p className="truncate text-xs font-semibold text-slate-400">{agentDraft.company}</p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.href === "#agent-panel";
              return (
                <a key={item.href} href={item.href} className={`surface-row flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition hover:text-white ${active ? "nav-link-active text-white" : "text-slate-300"}`}>
                  <Icon className={`h-4 w-4 ${item.tone}`} />
                  {item.label}
                </a>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="metric-card rounded-2xl p-3.5">
              <p className="text-[11px] font-bold uppercase text-slate-500">Fontes</p>
              <p className="mt-1 text-2xl font-black text-white">{state.stats.sourceCount}</p>
            </div>
            <div className="metric-card rounded-2xl p-3.5">
              <p className="text-[11px] font-bold uppercase text-slate-500">Chunks</p>
              <p className="mt-1 text-2xl font-black text-white">{state.stats.chunkCount}</p>
            </div>
            <div className="metric-card rounded-2xl p-3.5">
              <p className="text-[11px] font-bold uppercase text-slate-500">FAQs</p>
              <p className="mt-1 text-2xl font-black text-white">{activeFaqs}</p>
            </div>
            <div className="metric-card rounded-2xl p-3.5">
              <p className="text-[11px] font-bold uppercase text-slate-500">Chat</p>
              <p className="mt-1 text-2xl font-black text-white">{state.messages.length}</p>
            </div>
          </div>

          <div className="status-card mt-auto rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-mint shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
              <p className="text-xs font-black uppercase text-slate-300">Local ativo</p>
            </div>
            <div className="space-y-2">
              <Badge tone="green"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> Agente pronto</Badge>
              <Badge tone="blue"><Zap className="mr-1 h-3.5 w-3.5" /> RAG local</Badge>
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <header className="panel hero-panel relative overflow-hidden rounded-[28px] px-5 py-6 sm:px-7 sm:py-7">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lagoon to-transparent" />
            <div className="flex items-center gap-3">
              <div className="brand-mark flex h-12 w-12 items-center justify-center rounded-2xl text-white lg:hidden">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-lagoon">Agente inteligente local</p>
                <h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">O Agente Local</h1>
                <p className="mt-2 text-sm font-medium text-slate-400">{agentDraft.company} - {agentDraft.segment}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone="green"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> Agente ativo</Badge>
              <Badge tone="blue"><Database className="mr-1 h-3.5 w-3.5" /> Base pronta</Badge>
              <Badge tone="purple"><Zap className="mr-1 h-3.5 w-3.5" /> {activeFaqs} FAQs</Badge>
            </div>
          </header>

          {error && (
            <div className="rounded-2xl border border-ember/30 bg-ember/10 px-4 py-3 text-sm font-semibold text-ember shadow-lg shadow-ember/10">
              {error}
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)] min-[1800px]:grid-cols-[390px_minmax(0,1fr)_460px]">
            <section id="agent-panel" className="panel rounded-[26px] p-5">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h2 className="section-title"><Sparkles className="h-5 w-5 text-lagoon" /> Agente</h2>
                <Badge tone="blue">Personalizavel</Badge>
              </div>

              <form className="space-y-[1.125rem]" onSubmit={handleSaveAgent}>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Nome</span>
                  <input className="field field-sm" value={agentDraft.name} onChange={(event) => patchAgent({ name: event.target.value })} />
                </label>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Empresa</span>
                    <input className="field field-sm" value={agentDraft.company} onChange={(event) => patchAgent({ company: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Segmento</span>
                    <input className="field field-sm" value={agentDraft.segment} onChange={(event) => patchAgent({ segment: event.target.value })} />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Persona</span>
                  <textarea className="field min-h-24 resize-y" value={agentDraft.persona} onChange={(event) => patchAgent({ persona: event.target.value })} />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Instrucoes</span>
                  <textarea className="field min-h-32 resize-y" value={agentDraft.instructions} onChange={(event) => patchAgent({ instructions: event.target.value })} />
                </label>

                <div>
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Modo de conversa</span>
                  <div className="grid grid-cols-3 gap-2">
                    {MODES.map((mode) => {
                      const Icon = mode.icon;
                      const active = agentDraft.mode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => patchAgent({ mode: mode.id, temperature: mode.temperature })}
                          className={`flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border text-sm font-bold transition ${active ? "border-lagoon/50 bg-gradient-to-br from-lagoon/25 to-plum/20 text-white shadow-lg shadow-lagoon/15" : "border-white/10 bg-white/[0.05] text-slate-400 hover:border-plum/35 hover:bg-white/[0.08] hover:text-white"}`}
                        >
                          <Icon className="h-5 w-5" />
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Habilidades</span>
                  <div className="grid grid-cols-2 gap-2">
                    {SKILLS.map((skill) => {
                      const active = agentDraft.skills.includes(skill.id);
                      return (
                        <label key={skill.id} className={`flex h-10 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition ${active ? "border-mint/30 bg-mint/10 text-mint" : "border-white/10 bg-white/[0.05] text-slate-400 hover:bg-white/[0.08]"}`}>
                          <input type="checkbox" checked={active} onChange={() => toggleSkill(skill.id)} />
                          {skill.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Resposta quando faltar informacao</span>
                  <input className="field field-sm" value={agentDraft.fallbackMessage} onChange={(event) => patchAgent({ fallbackMessage: event.target.value })} />
                </label>

                <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar agente
                </button>
              </form>
            </section>

            <section className="flex flex-col gap-4">
              <div id="knowledge-panel" className="panel rounded-[26px] p-5">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <h2 className="section-title"><Database className="h-5 w-5 text-mint" /> Conhecimento</h2>
                  <label className="icon-btn cursor-pointer" title="Carregar arquivo de texto">
                    <Upload className="h-4 w-4" />
                    <input className="hidden" type="file" accept=".txt,.md,.csv,.json" onChange={(event) => handleFile(event.target.files?.[0])} />
                  </label>
                </div>

                <form className="space-y-3" onSubmit={handleKnowledgeSubmit}>
                  <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                    <input className="field field-sm" placeholder="Nome da fonte" value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
                    <select className="field field-sm" value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceType)}>
                      {Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <textarea className="field min-h-32 resize-y" placeholder="Cole tabela de precos, politicas comerciais, horarios, servicos ou textos do negocio." value={sourceContent} onChange={(event) => setSourceContent(event.target.value)} />
                  <button type="submit" className="btn-mint" disabled={sourceContent.trim().length < 20 || !sourceName.trim()}>
                    <Plus className="h-4 w-4" />
                    Adicionar conhecimento
                  </button>
                </form>

                <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 min-[1800px]:grid-cols-1">
                  {state.knowledgeSources.map((source) => (
                    <div key={source.id} className="surface-row flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400" />
                          <p className="truncate text-sm font-bold text-white">{source.sourceName}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{SOURCE_LABELS[source.sourceType]} - pronto para consulta</p>
                      </div>
                      <button className="icon-btn shrink-0" title="Remover fonte" onClick={async () => setState(await deleteKnowledge(source.id))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div id="faq-panel" className="panel rounded-[26px] p-5">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <h2 className="section-title"><Check className="h-5 w-5 text-plum" /> FAQ</h2>
                  <Badge tone="purple">{activeFaqs} ativas</Badge>
                </div>

                <form className="grid gap-3" onSubmit={handleFaqSubmit}>
                  <input className="field field-sm" placeholder="Pergunta" value={faqQuestion} onChange={(event) => setFaqQuestion(event.target.value)} />
                  <textarea className="field min-h-20 resize-y" placeholder="Resposta" value={faqAnswer} onChange={(event) => setFaqAnswer(event.target.value)} />
                  <button type="submit" className="btn-plum w-fit" disabled={!faqQuestion.trim() || !faqAnswer.trim()}>
                    <Plus className="h-4 w-4" />
                    Adicionar FAQ
                  </button>
                </form>

                <div className="mt-5 grid gap-3">
                  {state.faqs.map((faq) => (
                    <div key={faq.id} className={`surface-row rounded-2xl px-3.5 py-3 ${faq.isActive ? "" : "opacity-60"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white">{faq.question}</p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-400">{faq.answer}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button className="icon-btn" title={faq.isActive ? "Desativar" : "Ativar"} onClick={async () => setState(await toggleFaq(faq.id, !faq.isActive))}>
                            <Check className={`h-4 w-4 ${faq.isActive ? "text-mint" : "text-slate-500"}`} />
                          </button>
                          <button className="icon-btn" title="Remover FAQ" onClick={async () => setState(await deleteFaq(faq.id))}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="chat-panel" className="panel chat-panel flex min-h-[720px] flex-col rounded-[26px] p-5 xl:col-span-2 min-[1800px]:sticky min-[1800px]:top-4 min-[1800px]:col-span-1 min-[1800px]:h-[calc(100vh-2rem)]">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h2 className="section-title"><MessageCircle className="h-5 w-5 text-ember" /> Playground</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Teste o atendimento como se fosse uma conversa real.</p>
                </div>
                <button className="icon-btn" title="Limpar conversa" onClick={handleResetChat}>
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>

              <div className="chat-window min-h-0 flex-1 overflow-y-auto rounded-[22px] border p-4">
                <div className="space-y-4">
                  {state.messages.length === 0 && (
                    <div className="flex min-h-56 items-center justify-center text-center text-sm font-semibold text-slate-500">
                      Playground pronto para teste.
                    </div>
                  )}
                  {state.messages.map((message) => {
                    const isCustomer = message.role === "customer";
                    return (
                      <div key={message.id} className={`flex gap-3 ${isCustomer ? "justify-end" : "justify-start"}`}>
                        {!isCustomer && <div className="brand-mark mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"><Bot className="h-4 w-4" /></div>}
                        <div className={`max-w-[calc(100%-3rem)] rounded-[20px] px-3.5 py-2.5 text-sm leading-relaxed shadow-lg ${isCustomer ? "bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-blue-500/15" : "border border-white/10 bg-white/[0.075] text-slate-100 shadow-black/20"}`}>
                          {message.content.split("[BREAK]").map((part, index) => (
                            <p key={index} className={index > 0 ? "mt-2" : ""}>{part.trim()}</p>
                          ))}
                        </div>
                        {isCustomer && <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.08] text-slate-300"><User className="h-4 w-4" /></div>}
                      </div>
                    );
                  })}
                  {chatLoading && (
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin text-lagoon" />
                      Pensando
                    </div>
                  )}
                </div>
              </div>

              <form className="mt-4 flex gap-2" onSubmit={handleSendChat}>
                <input className="field field-sm flex-1" placeholder="Mensagem do cliente" value={chatInput} onChange={(event) => setChatInput(event.target.value)} />
                <button className="btn-ember h-[2.7rem] w-[2.7rem] shrink-0 px-0" title="Enviar" disabled={chatLoading || !chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3.5 py-2.5 text-xs font-medium text-slate-500">
                Base de conhecimento, FAQ e regras comerciais conectadas.
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
