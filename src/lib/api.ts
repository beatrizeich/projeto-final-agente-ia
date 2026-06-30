import type {
  AgentConfig,
  ChatResponse,
  PublicState,
  SourceType,
} from "../../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || "Falha na requisição");
  }

  return response.json() as Promise<T>;
}

export function getState() {
  return request<PublicState>("/api/state");
}

export function saveAgent(agent: Partial<AgentConfig>) {
  return request<PublicState>("/api/agent", {
    method: "PUT",
    body: JSON.stringify(agent),
  });
}

export function addKnowledge(input: {
  sourceName: string;
  sourceType: SourceType;
  content: string;
}) {
  return request<PublicState>("/api/knowledge", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteKnowledge(id: string) {
  return request<PublicState>(`/api/knowledge/${id}`, { method: "DELETE" });
}

export function addFaq(input: { question: string; answer: string }) {
  return request<PublicState>("/api/faqs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function toggleFaq(id: string, isActive: boolean) {
  return request<PublicState>(`/api/faqs/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export function deleteFaq(id: string) {
  return request<PublicState>(`/api/faqs/${id}`, { method: "DELETE" });
}

export function sendChat(message: string) {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function resetChat() {
  return request<PublicState>("/api/reset-chat", { method: "POST" });
}
