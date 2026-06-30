import "dotenv/config";
import cors from "cors";
import express from "express";
import { z } from "zod";
import type { PublicState, SourceType } from "../shared/types";
import { generateReply, parseControlTags, createMessage } from "./llm";
import { classifyPlaybook } from "./playbooks";
import { buildMessagesForLlm, buildSystemPrompt } from "./prompt";
import { findFaqMatch, searchKnowledge } from "./rag";
import {
  addFaq,
  addKnowledgeSource,
  deleteFaq,
  deleteKnowledgeSource,
  loadState,
  resetChat,
  saveState,
  updateAgent,
  updateFaq,
} from "./storage";

const app = express();
const port = Number(process.env.API_PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "3mb" }));

function publicState(state: Awaited<ReturnType<typeof loadState>>): PublicState {
  return {
    ...state,
    stats: {
      sourceCount: state.knowledgeSources.length,
      chunkCount: state.knowledgeChunks.length,
      faqCount: state.faqs.length,
      llmConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    },
  };
}

const agentSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  segment: z.string().min(1).optional(),
  persona: z.string().optional(),
  instructions: z.string().optional(),
  model: z.string().optional(),
  mode: z.enum(["precise", "friendly", "formal"]).optional(),
  temperature: z.number().min(0).max(1).optional(),
  skills: z.array(z.enum(["greeting", "faq", "escalation", "lead-capture", "sentiment", "follow-up"])).optional(),
  fallbackMessage: z.string().optional(),
});

const knowledgeSchema = z.object({
  sourceName: z.string().min(1),
  sourceType: z.enum(["document", "manual", "website", "social"]),
  content: z.string().min(20),
});

const faqSchema = z.object({
  question: z.string().min(3),
  answer: z.string().min(3),
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    llmConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    provider: process.env.OPENROUTER_API_KEY ? "openrouter" : "local-fallback",
  });
});

app.get("/api/state", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(publicState(state));
  } catch (error) {
    next(error);
  }
});

app.put("/api/agent", async (req, res, next) => {
  try {
    const patch = agentSchema.parse(req.body);
    await updateAgent(patch);
    const state = await loadState();
    res.json(publicState(state));
  } catch (error) {
    next(error);
  }
});

app.post("/api/knowledge", async (req, res, next) => {
  try {
    const input = knowledgeSchema.parse(req.body);
    await addKnowledgeSource({
      ...input,
      sourceType: input.sourceType as SourceType,
    });
    const state = await loadState();
    res.status(201).json(publicState(state));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/knowledge/:id", async (req, res, next) => {
  try {
    await deleteKnowledgeSource(req.params.id);
    const state = await loadState();
    res.json(publicState(state));
  } catch (error) {
    next(error);
  }
});

app.post("/api/faqs", async (req, res, next) => {
  try {
    const input = faqSchema.parse(req.body);
    await addFaq(input);
    const state = await loadState();
    res.status(201).json(publicState(state));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/faqs/:id", async (req, res, next) => {
  try {
    await updateFaq(req.params.id, req.body);
    const state = await loadState();
    res.json(publicState(state));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/faqs/:id", async (req, res, next) => {
  try {
    await deleteFaq(req.params.id);
    const state = await loadState();
    res.json(publicState(state));
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const { message } = z.object({ message: z.string().min(1) }).parse(req.body);
    const state = await loadState();
    const userMessage = createMessage("customer", message.trim());
    const playbook = classifyPlaybook(userMessage.content);
    const sources = searchKnowledge(state.knowledgeChunks, userMessage.content, 8);
    const faqMatch = state.agent.skills.includes("faq")
      ? findFaqMatch(state.faqs, userMessage.content)
      : null;

    if (faqMatch) {
      state.faqs = state.faqs.map((faq) => (
        faq.id === faqMatch.id ? { ...faq, matchCount: faq.matchCount + 1 } : faq
      ));
    }

    const systemPrompt = buildSystemPrompt({
      agent: state.agent,
      playbook,
      sources,
      faqMatch,
      memory: state.memory,
    });
    const llmMessages = buildMessagesForLlm(systemPrompt, state.messages, userMessage.content);
    const { rawReply, provider } = await generateReply({
      agent: state.agent,
      messages: llmMessages,
      playbook,
      sources,
      faqMatch,
      userMessage: userMessage.content,
    });

    const parsed = parseControlTags(rawReply);
    const agentMessage = createMessage("agent", parsed.cleanReply);
    state.messages = [...state.messages, userMessage, agentMessage];

    if (parsed.tags.lead || parsed.tags.sentiment) {
      state.memory = {
        summary: parsed.tags.lead
          ? `Cliente demonstrou interesse em ${state.agent.company}.`
          : "Cliente conversou com o agente no playground local.",
        keyFacts: {
          nome: parsed.tags.lead?.nome || state.memory?.keyFacts.nome,
          empresa: parsed.tags.lead?.empresa || state.memory?.keyFacts.empresa,
          necessidade: playbook.label,
          sentimento: (parsed.tags.sentiment as "positivo" | "neutro" | "negativo" | "frustrado" | null) ?? state.memory?.keyFacts.sentimento,
          proximosPassos: parsed.tags.escalated ? "Equipe humana deve assumir." : "Continuar qualificação no chat.",
          painPoints: state.memory?.keyFacts.painPoints ?? [],
          preferencias: state.memory?.keyFacts.preferencias ?? [],
        },
        conversationsCount: (state.memory?.conversationsCount ?? 0) + 1,
        lastInteractionAt: new Date().toISOString(),
      };
    }

    await saveState(state);

    res.json({
      message: agentMessage,
      cleanReply: parsed.cleanReply,
      playbook,
      sources,
      faqMatch,
      provider,
      tags: parsed.tags,
      promptPreview: systemPrompt.slice(0, 5000),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reset-chat", async (_req, res, next) => {
  try {
    await resetChat();
    const state = await loadState();
    res.json(publicState(state));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Dados inválidos", details: error.flatten() });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: error instanceof Error ? error.message : "Erro interno",
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`API local em http://127.0.0.1:${port}`);
});
