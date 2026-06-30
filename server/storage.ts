import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentConfig,
  AppState,
  FaqItem,
  KnowledgeSource,
  SourceType,
} from "../shared/types";
import { buildChunksForSource, sourcePriority } from "./rag";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.resolve(__dirname, "..", "data", "store.json");

function now() {
  return new Date().toISOString();
}

async function readStateFile(): Promise<AppState> {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  return JSON.parse(raw) as AppState;
}

export async function saveState(state: AppState) {
  await fs.writeFile(DATA_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function loadState(): Promise<AppState> {
  const state = await readStateFile();
  if (!state.knowledgeChunks?.length && state.knowledgeSources.length) {
    state.knowledgeChunks = state.knowledgeSources.flatMap(buildChunksForSource);
    await saveState(state);
  }
  return state;
}

export async function updateAgent(agentPatch: Partial<AgentConfig>) {
  const state = await loadState();
  state.agent = {
    ...state.agent,
    ...agentPatch,
  };
  await saveState(state);
  return state.agent;
}

export async function addKnowledgeSource(input: {
  sourceName: string;
  sourceType: SourceType;
  content: string;
}) {
  const state = await loadState();
  const source: KnowledgeSource = {
    id: crypto.randomUUID(),
    sourceName: input.sourceName.trim() || "conteudo-manual.txt",
    sourceType: input.sourceType,
    sourcePriority: sourcePriority(input.sourceType),
    content: input.content.trim(),
    createdAt: now(),
  };

  state.knowledgeSources.unshift(source);
  state.knowledgeChunks = [
    ...buildChunksForSource(source),
    ...state.knowledgeChunks,
  ];
  await saveState(state);
  return source;
}

export async function deleteKnowledgeSource(sourceId: string) {
  const state = await loadState();
  state.knowledgeSources = state.knowledgeSources.filter((source) => source.id !== sourceId);
  state.knowledgeChunks = state.knowledgeChunks.filter((chunk) => chunk.sourceId !== sourceId);
  await saveState(state);
}

export async function addFaq(input: { question: string; answer: string }) {
  const state = await loadState();
  const faq: FaqItem = {
    id: crypto.randomUUID(),
    question: input.question.trim(),
    answer: input.answer.trim(),
    isActive: true,
    matchCount: 0,
    createdAt: now(),
  };
  state.faqs.unshift(faq);
  await saveState(state);
  return faq;
}

export async function updateFaq(id: string, patch: Partial<FaqItem>) {
  const state = await loadState();
  state.faqs = state.faqs.map((faq) => (faq.id === id ? { ...faq, ...patch } : faq));
  await saveState(state);
}

export async function deleteFaq(id: string) {
  const state = await loadState();
  state.faqs = state.faqs.filter((faq) => faq.id !== id);
  await saveState(state);
}

export async function resetChat() {
  const state = await loadState();
  state.messages = [];
  state.memory = null;
  await saveState(state);
}
