import type { AgentConfig, SkillId } from "../shared/types";

export const SKILL_LABELS: Record<SkillId, string> = {
  greeting: "Saudação",
  faq: "FAQ",
  escalation: "Escalonamento",
  "lead-capture": "Captura de lead",
  sentiment: "Sentimento",
  "follow-up": "Follow-up",
};

export function getGreeting() {
  const hour = (new Date().getUTCHours() - 3 + 24) % 24;
  if (hour >= 12 && hour < 18) return "Boa tarde";
  if (hour >= 18 || hour < 6) return "Boa noite";
  return "Bom dia";
}

export function buildSkillInstructions(agent: AgentConfig) {
  const lines: string[] = [];
  const skills = new Set(agent.skills);
  const greeting = getGreeting();

  if (skills.has("greeting")) {
    lines.push(`Use "${greeting}" na primeira interação quando fizer sentido.`);
  }
  if (skills.has("faq")) {
    lines.push("Quando houver FAQ relevante no contexto, priorize a resposta da FAQ e adapte só o tom.");
  }
  if (skills.has("escalation")) {
    lines.push("Se o cliente pedir humano, estiver frustrado ou o assunto sair do escopo, encaminhe para a equipe e inclua [ESCALATE] no final.");
  }
  if (skills.has("lead-capture")) {
    lines.push("Colete nome, telefone ou email de forma natural quando houver oportunidade e registre com [LEAD: nome=X | email=Y | telefone=Z].");
  }
  if (skills.has("sentiment")) {
    lines.push("Adapte o tom ao sentimento do cliente e inclua [SENTIMENT: positivo|neutro|negativo|frustrado] no final.");
  }
  if (skills.has("follow-up")) {
    lines.push("Use a memória do contato de forma natural quando houver histórico.");
  }

  return lines.length ? `\n\n## HABILIDADES ATIVAS\n${lines.map((line) => `- ${line}`).join("\n")}` : "";
}
