import { describe, expect, it } from "vitest";
import type { AgentConfig, KnowledgeSource, PlaybookDecision, RetrievalHit } from "../shared/types";
import { generateReply, parseControlTags, parseServiceRows } from "./llm";
import { buildChunksForSource, findFaqMatch, searchKnowledge } from "./rag";

const agent: AgentConfig = {
  name: "Lia",
  company: "Studio Clara Beleza",
  segment: "estetica",
  persona: "Simpatica e direta",
  instructions: "Atender clientes pelo WhatsApp",
  model: "openai/gpt-4.1-mini",
  mode: "precise",
  temperature: 0.2,
  skills: ["faq", "lead-capture", "sentiment"],
  fallbackMessage: "Vou verificar com a equipe e já te retorno com a informação certinha.",
};

const playbook: PlaybookDecision = {
  id: "sales",
  label: "Vendas",
  confidence: 0.8,
  signals: [],
};

function hit(content: string): RetrievalHit {
  return {
    id: "chunk",
    sourceId: "source",
    sourceName: "base.md",
    sourceType: "document",
    sourcePriority: 100,
    content,
    chunkIndex: 0,
    createdAt: new Date().toISOString(),
    score: 10,
    matchedTerms: [],
  };
}

const servicesTable = hit("| Serviço | Duração | Valor |\n| --- | --- | --- |\n| Limpeza de pele | 60 min | R$ 149,00 |\n| Design de sobrancelhas | 30 min | R$ 49,00 |\n| Drenagem linfática | 50 min | R$ 119,00 |");

describe("RAG local", () => {
  it("preserva tabela de preços em um único chunk curto", () => {
    const source: KnowledgeSource = {
      id: "pricing",
      sourceName: "precos.md",
      sourceType: "document",
      sourcePriority: 100,
      createdAt: new Date().toISOString(),
      content: "| Plano | Valor |\n| --- | --- |\n| Básico | R$ 99,00 |\n| Pro | R$ 199,00 |",
    };

    const chunks = buildChunksForSource(source);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("R$ 199,00");
  });

  it("recupera chunks relevantes por termos em português", () => {
    const chunks = buildChunksForSource({
      id: "hours",
      sourceName: "horarios.txt",
      sourceType: "manual",
      sourcePriority: 90,
      createdAt: new Date().toISOString(),
      content: "Atendimento de segunda a sexta das 9h às 19h. Sábado das 9h às 13h.",
    });

    const hits = searchKnowledge(chunks, "vocês atendem sábado?");
    expect(hits[0].content).toContain("Sábado");
  });

  it("encontra FAQ ativa similar", () => {
    const match = findFaqMatch([
      {
        id: "1",
        question: "Como faço para agendar?",
        answer: "Envie nome, serviço e melhor horário.",
        isActive: true,
        matchCount: 0,
        createdAt: new Date().toISOString(),
      },
    ], "quero agendar um horario");

    expect(match?.id).toBe("1");
  });

  it("nao confunde pergunta de servicos com FAQ de agendamento", () => {
    const match = findFaqMatch([
      {
        id: "agenda",
        question: "Como faço para agendar?",
        answer: "Envie nome, serviço e melhor horário.",
        isActive: true,
        matchCount: 0,
        createdAt: new Date().toISOString(),
      },
    ], "quais os serviços?");

    expect(match).toBeNull();
  });

  it("extrai linhas de servicos de tabela markdown", () => {
    const rows = parseServiceRows([
      {
        id: "chunk",
        sourceId: "source",
        sourceName: "precos.md",
        sourceType: "document",
        sourcePriority: 100,
        content: "| Serviço | Duração | Valor |\n| --- | --- | --- |\n| Limpeza de pele | 60 min | R$ 149,00 |",
        chunkIndex: 0,
        createdAt: new Date().toISOString(),
        score: 1,
        matchedTerms: [],
      },
    ]);

    expect(rows[0]).toMatchObject({
      service: "Limpeza de pele",
      duration: "60 min",
      price: "R$ 149,00",
    });
  });

  it("responde servico especifico sem copiar a base inteira", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [],
      playbook,
      sources: [servicesTable],
      faqMatch: null,
      userMessage: "faz limpeza de pele?",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("Sim, fazemos Limpeza de pele");
    expect(parsed.cleanReply).toContain("60 min");
    expect(parsed.cleanReply).toContain("R$ 149,00");
    expect(parsed.cleanReply).not.toContain("Design de sobrancelhas");
    expect(parsed.cleanReply).not.toContain("encontrei estas informações");
  });

  it("responde apenas horarios quando o cliente pergunta horarios", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [],
      playbook,
      sources: [hit("Atendimento de segunda a sexta das 9h às 19h e sábado das 9h às 13h. Domingo fechado. Pagamentos aceitos: Pix e cartão.")],
      faqMatch: null,
      userMessage: "qual o horário de funcionamento?",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("segunda a sexta");
    expect(parsed.cleanReply).toContain("sábado");
    expect(parsed.cleanReply).not.toContain("Pagamentos aceitos");
  });

  it("responde apenas pagamento quando o cliente pergunta pagamento", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [],
      playbook,
      sources: [hit("Pagamentos aceitos: Pix, cartão de débito e cartão de crédito em até 3 vezes para pacotes acima de R$ 300,00. Atendimento de segunda a sexta das 9h às 19h.")],
      faqMatch: null,
      userMessage: "quais formas de pagamento?",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("Pix");
    expect(parsed.cleanReply).toContain("cartão");
    expect(parsed.cleanReply).not.toContain("segunda a sexta");
  });

  it("usa fallback quando informacao nao existe na base", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [],
      playbook,
      sources: [],
      faqMatch: null,
      userMessage: "faz botox?",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toBe(agent.fallbackMessage);
  });

  it("usa fallback para servico inexistente mesmo com fonte generica recuperada", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [],
      playbook,
      sources: [hit("O Studio Clara Beleza oferece serviços de estética facial e bem-estar. Atendimento de segunda a sexta das 9h às 19h.")],
      faqMatch: null,
      userMessage: "faz botox?",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toBe(agent.fallbackMessage);
  });

  it("continua fluxo de agendamento quando cliente responde sim", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [
        {
          role: "assistant",
          content: "Sim, fazemos Limpeza de pele. A sessão dura em média 60 min e custa R$ 149,00. Quer que eu veja um horário para você?",
        },
      ],
      playbook,
      sources: [servicesTable],
      faqMatch: null,
      userMessage: "sim",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("Qual melhor dia ou período");
    expect(parsed.cleanReply).not.toContain("Studio Clara Beleza oferece");
  });

  it("pede dia e periodo quando cliente responde quero depois de pergunta de agenda", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [
        {
          role: "assistant",
          content: "Perfeito. Qual melhor dia ou período para você?",
        },
      ],
      playbook,
      sources: [servicesTable],
      faqMatch: null,
      userMessage: "quero",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("Me diga o dia");
    expect(parsed.cleanReply).not.toContain("Studio Clara Beleza oferece");
  });

  it("responde disponibilidade de segunda quando cliente pede horario na segunda", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [
        {
          role: "assistant",
          content: "Perfeito. Qual melhor dia ou período para você?",
        },
      ],
      playbook,
      sources: [
        hit("Segunda a sexta: 9h às 19h\nSábado: 9h às 13h\nDomingo: fechado"),
      ],
      faqMatch: null,
      userMessage: "quero um horário na segunda",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("Na segunda atendemos das 9h às 19h");
    expect(parsed.cleanReply).toContain("manhã ou tarde");
    expect(parsed.cleanReply).not.toContain("Studio Clara Beleza oferece");
  });

  it("continua agendamento quando cliente informa horario depois do dia", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [
        {
          role: "user",
          content: "faz limpeza de pele?",
        },
        {
          role: "assistant",
          content: "Sim, fazemos Limpeza de pele. A sessão dura em média 60 min e custa R$ 149,00. Quer que eu veja um horário para você?",
        },
        {
          role: "user",
          content: "quero um horario na segunda",
        },
        {
          role: "assistant",
          content: "Na segunda atendemos das 9h às 19h. Você prefere manhã ou tarde? Me manda seu nome completo para eu deixar encaminhado.",
        },
      ],
      playbook,
      sources: [
        hit("Segunda a sexta: 9h às 19h\nSábado: 9h às 13h\nDomingo: fechado"),
      ],
      faqMatch: null,
      userMessage: "quero as 9h da manhã",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("segunda às 9h");
    expect(parsed.cleanReply).toContain("Limpeza de pele");
    expect(parsed.cleanReply).toContain("nome completo");
    expect(parsed.cleanReply).not.toContain("Studio Clara Beleza oferece");
  });

  it("pede apenas o nome quando cliente informa dia e horario juntos", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [
        {
          role: "user",
          content: "faz limpeza de pele?",
        },
        {
          role: "assistant",
          content: "Sim, fazemos Limpeza de pele. A sessão dura em média 60 min e custa R$ 149,00. Quer que eu veja um horário para você?",
        },
      ],
      playbook,
      sources: [
        hit("Segunda a sexta: 9h às 19h\nSábado: 9h às 13h\nDomingo: fechado"),
      ],
      faqMatch: null,
      userMessage: "sim, segunda as 9h da manh",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("segunda às 9h");
    expect(parsed.cleanReply).toContain("nome completo");
    expect(parsed.cleanReply).not.toContain("manhã ou tarde");
    expect(parsed.cleanReply).not.toContain("Studio Clara Beleza oferece");
  });

  it("fecha encaminhamento quando cliente informa nome completo", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await generateReply({
      agent,
      messages: [
        {
          role: "user",
          content: "faz limpeza de pele?",
        },
        {
          role: "assistant",
          content: "Sim, fazemos Limpeza de pele. A sessão dura em média 60 min e custa R$ 149,00. Quer que eu veja um horário para você?",
        },
        {
          role: "user",
          content: "quero um horario na segunda",
        },
        {
          role: "assistant",
          content: "Na segunda atendemos das 9h às 19h. Você prefere manhã ou tarde? Me manda seu nome completo para eu deixar encaminhado.",
        },
        {
          role: "user",
          content: "quero as 9h da manhã",
        },
        {
          role: "assistant",
          content: "Perfeito, segunda às 9h para Limpeza de pele. Me manda seu nome completo para eu deixar encaminhado.",
        },
      ],
      playbook,
      sources: [
        hit("Segunda a sexta: 9h às 19h\nSábado: 9h às 13h\nDomingo: fechado"),
      ],
      faqMatch: null,
      userMessage: "Beatriz Eich Back Silva",
    });
    const parsed = parseControlTags(response.rawReply);

    expect(parsed.cleanReply).toContain("Perfeito, Beatriz");
    expect(parsed.cleanReply).toContain("Limpeza de pele");
    expect(parsed.cleanReply).toContain("segunda às 9h");
    expect(parsed.cleanReply).toContain("sinal de reserva");
    expect(parsed.cleanReply).not.toContain("Studio Clara Beleza oferece");
    expect(parsed.tags.lead?.nome).toBe("Beatriz Eich Back Silva");
  });
});
