export type SourceType = "document" | "manual" | "website" | "social";

export type ConversationMode = "precise" | "friendly" | "formal";

export type SkillId =
  | "greeting"
  | "faq"
  | "escalation"
  | "lead-capture"
  | "sentiment"
  | "follow-up";

export type PlaybookId =
  | "sales"
  | "support"
  | "lead_capture"
  | "escalation"
  | "general";

export interface AgentConfig {
  name: string;
  company: string;
  segment: string;
  persona: string;
  instructions: string;
  model: string;
  mode: ConversationMode;
  temperature: number;
  skills: SkillId[];
  fallbackMessage: string;
}

export interface KnowledgeSource {
  id: string;
  sourceName: string;
  sourceType: SourceType;
  sourcePriority: number;
  content: string;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  sourcePriority: number;
  content: string;
  chunkIndex: number;
  createdAt: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  isActive: boolean;
  matchCount: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "customer" | "agent";
  content: string;
  createdAt: string;
}

export interface MemoryRecord {
  summary: string;
  keyFacts: {
    nome?: string;
    empresa?: string;
    necessidade?: string;
    painPoints?: string[];
    preferencias?: string[];
    sentimento?: "positivo" | "neutro" | "negativo" | "frustrado";
    proximosPassos?: string;
  };
  conversationsCount: number;
  lastInteractionAt: string;
}

export interface AppState {
  agent: AgentConfig;
  knowledgeSources: KnowledgeSource[];
  knowledgeChunks: KnowledgeChunk[];
  faqs: FaqItem[];
  messages: ChatMessage[];
  memory: MemoryRecord | null;
}

export interface RetrievalHit extends KnowledgeChunk {
  score: number;
  matchedTerms: string[];
}

export interface PlaybookDecision {
  id: PlaybookId;
  label: string;
  confidence: number;
  signals: string[];
}

export interface ChatResponse {
  message: ChatMessage;
  cleanReply: string;
  playbook: PlaybookDecision;
  sources: RetrievalHit[];
  faqMatch: FaqItem | null;
  provider: "openrouter" | "local-fallback";
  tags: {
    escalated: boolean;
    sentiment: string | null;
    lead: Record<string, string> | null;
  };
  promptPreview: string;
}

export interface PublicState extends AppState {
  stats: {
    sourceCount: number;
    chunkCount: number;
    faqCount: number;
    llmConfigured: boolean;
  };
}
