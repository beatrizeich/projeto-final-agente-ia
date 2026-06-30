import type { PlaybookDecision, PlaybookId } from "../shared/types";
import { normalizeText } from "./rag";

interface PlaybookSpec {
  id: PlaybookId;
  label: string;
  prompt: string;
  hints: string[];
}

export const PLAYBOOKS: Record<PlaybookId, PlaybookSpec> = {
  sales: {
    id: "sales",
    label: "Vendas",
    prompt:
      "Modo vendas: o cliente demonstra intenção de compra. Foque no problema, use preço e condições apenas quando estiverem na base de conhecimento e proponha um próximo passo claro.",
    hints: ["preco", "valor", "custa", "orcamento", "comprar", "desconto", "proposta", "fechar", "pacote"],
  },
  support: {
    id: "support",
    label: "Suporte",
    prompt:
      "Modo suporte: o cliente tem uma dúvida ou problema. Peça contexto suficiente sem interrogar, responda direto com base nas fontes e não invente procedimento.",
    hints: ["problema", "erro", "ajuda", "duvida", "nao funciona", "suporte", "remarcar", "cancelar"],
  },
  lead_capture: {
    id: "lead_capture",
    label: "Captura de lead",
    prompt:
      "Modo captura: o cliente demonstrou interesse, mas ainda não decidiu. Colete nome, contato e necessidade aos poucos, em tom natural.",
    hints: ["me liga", "contato", "interessado", "whatsapp", "cotacao", "agenda", "agendar", "horario"],
  },
  escalation: {
    id: "escalation",
    label: "Escalonamento",
    prompt:
      "Modo escalonamento: o cliente pediu humano, está frustrado ou o caso saiu do escopo. Reconheça a situação e encaminhe para a equipe sem prometer prazo.",
    hints: ["humano", "atendente", "gerente", "reclamar", "responsavel", "pessoa", "insatisfeito"],
  },
  general: {
    id: "general",
    label: "Geral",
    prompt:
      "Modo geral: ainda não há intenção clara. Mantenha a conversa curta e faça uma pergunta aberta para entender a necessidade.",
    hints: [],
  },
};

export function classifyPlaybook(message: string): PlaybookDecision {
  const normalized = normalizeText(message);
  const scored = Object.values(PLAYBOOKS)
    .filter((playbook) => playbook.id !== "general")
    .map((playbook) => {
      const signals = playbook.hints.filter((hint) => normalized.includes(hint));
      return {
        id: playbook.id,
        label: playbook.label,
        signals,
        confidence: Math.min(0.96, signals.length * 0.25 + (signals.length > 0 ? 0.35 : 0)),
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (!best || best.confidence < 0.5) {
    return {
      id: "general",
      label: PLAYBOOKS.general.label,
      confidence: 0.35,
      signals: [],
    };
  }

  return best;
}
