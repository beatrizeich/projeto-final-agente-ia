import type {
  AgentConfig,
  ChatMessage,
  FaqItem,
  PlaybookDecision,
  RetrievalHit,
} from "../shared/types";

interface LlmArgs {
  agent: AgentConfig;
  messages: Array<{ role: string; content: string }>;
  playbook: PlaybookDecision;
  sources: RetrievalHit[];
  faqMatch: FaqItem | null;
  userMessage: string;
}

interface ServiceRow {
  service: string;
  duration?: string;
  price?: string;
}

interface SchedulingContext {
  service?: string;
  day?: string | null;
  time?: string | null;
  period?: "manha" | "tarde" | "noite" | null;
  name?: string | null;
}

export function parseControlTags(reply: string) {
  const leadMatch = reply.match(/\[LEAD:\s*([^\]]+)\]/i);
  const lead: Record<string, string> | null = leadMatch
    ? Object.fromEntries(
        leadMatch[1]
          .split("|")
          .map((part) => part.split("="))
          .filter(([key, value]) => key?.trim() && value?.trim())
          .map(([key, ...value]) => [key.trim().toLowerCase(), value.join("=").trim()]),
      )
    : null;

  const sentiment = reply.match(/\[SENTIMENT:\s*(positivo|neutro|negativo|frustrado)\s*\]/i)?.[1]?.toLowerCase() ?? null;
  const escalated = /\[ESCALATE(?::\w+)?\]/i.test(reply);
  const cleanReply = reply
    .replace(/\s*\[ESCALATE(?::\w+)?\]\s*/gi, " ")
    .replace(/\s*\[LEAD:\s*[^\]]+\]\s*/gi, " ")
    .replace(/\s*\[SENTIMENT:\s*[^\]]+\]\s*/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return {
    cleanReply,
    tags: {
      escalated,
      sentiment,
      lead,
    },
  };
}

function modeFallbackTone(agent: AgentConfig) {
  if (agent.mode === "formal") return "Claro.";
  if (agent.mode === "friendly") return "Opa, claro!";
  return "Claro.";
}

function inlineOpener(agent: AgentConfig) {
  if (agent.mode === "friendly") return "Opa, claro";
  return "Claro";
}

function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isGreetingOnly(message: string) {
  const normalized = normalizeText(message).replace(/[^\p{L}\s]/gu, "").trim();
  return /^(oi|ola|bom dia|boa tarde|boa noite|hey|e ai|eai|opa)$/.test(normalized);
}

function isServicesQuestion(message: string) {
  const normalized = normalizeText(message);
  return /(quais|qual|lista|tem|oferece|faz|servi|proced|opcoes|tratament)/.test(normalized) &&
    /(servi|proced|opcoes|tratament)/.test(normalized);
}

function isSchedulingQuestion(message: string) {
  return /(agendar|agenda|marcar|horario|horários|horarios|reservar|sabado|sábado|atende|atendimento|funciona|funcionamento)/i.test(message);
}

function isAppointmentIntent(message: string) {
  const normalized = normalizeText(message);
  return /(agendar|marcar|reservar)/.test(normalized) ||
    /(quero|queria|gostaria|preciso|pode|posso|ve|ver|conseguir).{0,35}(horario|agenda)/.test(normalized) ||
    /(horario|agenda).{0,35}(segunda|terca|quarta|quinta|sexta|sabado|domingo|manha|tarde|noite|\d{1,2}\s*h)/.test(normalized);
}

function wantsPrice(message: string) {
  return /pre[cç]o|valor|custa|quanto|r\$/i.test(message);
}

function isPaymentQuestion(message: string) {
  return /pagamento|pagar|pix|cart[aã]o|credito|crédito|debito|débito|parcela|parcel/i.test(message);
}

function isShortAffirmative(message: string) {
  const normalized = normalizeText(message).replace(/[^\p{L}\s]/gu, "").trim();
  return /^(sim|quero|pode|ok|isso|claro|por favor|pode ser|quero sim|sim quero)$/.test(normalized);
}

function lastAssistantMessage(messages: Array<{ role: string; content: string }>) {
  return [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content ?? "";
}

function assistantIsScheduling(lastMessage: string) {
  const normalized = normalizeText(lastMessage);
  return /agendar|horario|periodo|melhor dia|manha|tarde|nome completo/.test(normalized);
}

function assistantAskedForDay(lastMessage: string) {
  const normalized = normalizeText(lastMessage);
  return /qual melhor dia|me diga o dia|dia e se prefere|periodo/.test(normalized);
}

function requestedWeekday(message: string) {
  const normalized = normalizeText(message);
  if (normalized.includes("segunda")) return "segunda";
  if (normalized.includes("terca")) return "terca";
  if (normalized.includes("quarta")) return "quarta";
  if (normalized.includes("quinta")) return "quinta";
  if (normalized.includes("sexta")) return "sexta";
  if (normalized.includes("sabado")) return "sabado";
  if (normalized.includes("domingo")) return "domingo";
  return null;
}

function formatWeekdayLabel(day: string) {
  const labels: Record<string, string> = {
    segunda: "segunda",
    terca: "terça",
    quarta: "quarta",
    quinta: "quinta",
    sexta: "sexta",
    sabado: "sábado",
    domingo: "domingo",
  };
  return labels[day] ?? day;
}

function formatPeriodLabel(period: SchedulingContext["period"]) {
  if (period === "manha") return "manhã";
  if (period === "tarde") return "tarde";
  if (period === "noite") return "noite";
  return "";
}

function priorConversationMessages(messages: Array<{ role: string; content: string }>, userMessage: string) {
  const conversational = messages.filter((message) => message.role !== "system");
  const last = conversational[conversational.length - 1];

  if (last?.role === "user" && last.content.trim() === userMessage.trim()) {
    return conversational.slice(0, -1);
  }

  return conversational;
}

function extractPeriod(message: string): SchedulingContext["period"] {
  const normalized = normalizeText(message);
  if (/\b(manha|matutino|cedo|manh)\b/.test(normalized)) return "manha";
  if (/\b(tarde|vespertino)\b/.test(normalized)) return "tarde";
  if (/\b(noite|noturno)\b/.test(normalized)) return "noite";
  return null;
}

function extractRequestedTime(message: string) {
  const normalized = normalizeText(message).replace(/\s+/g, " ");
  const match = normalized.match(/\b(?:as|a|para|pra)?\s*(\d{1,2})(?:\s*(?:h|:)\s*(\d{2})?)?\b/);
  if (!match) return null;

  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;

  const minutes = match[2]?.padEnd(2, "0").slice(0, 2);
  return minutes && minutes !== "00" ? `${hour}:${minutes}` : `${hour}h`;
}

function cleanServiceCandidate(candidate: string | undefined) {
  const service = candidate?.trim();
  if (!service) return null;

  const normalized = normalizeText(service);
  if (
    /^(eu|voce|voces|a gente|gente)\b/.test(normalized) ||
    /(deixar|encaminhad|horario|periodo|dia|nome completo|agenda|agendar)/.test(normalized)
  ) {
    return null;
  }

  return service;
}

function extractServiceFromAssistant(message: string) {
  const cleaned = message.replace(/\[BREAK\]/g, " ");
  const direct = cleaned.match(/fazemos\s+([^.!?]+?)(?:\.|,|\s+A sessão|\s+A sessao|$)/i);
  const directService = cleanServiceCandidate(direct?.[1]);
  if (directService) return directService;

  const scheduled = cleaned.match(/(?:para|serviço:|servico:)\s+([^.!?]+?)(?:\s+na|\s+no|\s+às|\s+as|\.|$)/i);
  const scheduledService = cleanServiceCandidate(scheduled?.[1]);
  if (scheduledService) return scheduledService;

  const summary = cleaned.match(/(?:encaminhado|encaminhar):\s*([^.!?]+?)(?:\s+na|\s+no|\s+às|\s+as|\.|$)/i);
  const summaryService = cleanServiceCandidate(summary?.[1]);
  if (summaryService) return summaryService;

  return null;
}

function extractCustomerName(message: string) {
  const trimmed = message.trim().replace(/[.!?]+$/g, "");
  const explicit = normalizeText(trimmed).match(/\b(?:meu nome e|me chamo|sou)\s+(.+)$/);
  if (explicit?.[1]) {
    const originalStart = trimmed.length - explicit[1].length;
    return trimmed.slice(originalStart).trim();
  }

  const normalized = normalizeText(trimmed);
  if (
    /^(oi|ola|sim|quero|ok|pode|claro|obrigad|valeu)\b/.test(normalized) ||
    /(horario|agendar|marcar|segunda|terca|quarta|quinta|sexta|sabado|domingo|manha|tarde|noite|servico|limpeza|pele|pagamento|valor|preco|custa)/.test(normalized)
  ) {
    return null;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const onlyNameWords = words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(word));
  return words.length >= 2 && onlyNameWords ? trimmed : null;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function businessWindowForDay(sources: RetrievalHit[], day: string) {
  if (day === "domingo") return null;

  const fullText = sources.map((source) => source.content).join("\n");

  if (["segunda", "terca", "quarta", "quinta", "sexta"].includes(day)) {
    const weekdayMatch = fullText.match(/segunda\s+a\s+sexta[\s\S]{0,40}?(\d{1,2})h\D{1,16}(\d{1,2})h/i);
    if (weekdayMatch) {
      return { open: Number(weekdayMatch[1]), close: Number(weekdayMatch[2]) };
    }
    return { open: 9, close: 19 };
  }

  if (day === "sabado") {
    const saturdayMatch = fullText.match(/s[aá].{0,5}bado[\s\S]{0,40}?(\d{1,2})h\D{1,16}(\d{1,2})h/i);
    if (saturdayMatch) {
      return { open: Number(saturdayMatch[1]), close: Number(saturdayMatch[2]) };
    }
    return { open: 9, close: 13 };
  }

  return null;
}

function isTimeInsideWindow(sources: RetrievalHit[], day: string, time: string) {
  const window = businessWindowForDay(sources, day);
  if (!window) return false;
  const hour = Number(time.match(/\d{1,2}/)?.[0]);
  return Number.isFinite(hour) && hour >= window.open && hour < window.close;
}

function availabilityRangeForDay(sources: RetrievalHit[], day: string) {
  const window = businessWindowForDay(sources, day);
  if (!window) return null;
  return `${window.open}h às ${window.close}h`;
}

function inferSchedulingContext(args: LlmArgs, services: ServiceRow[]): SchedulingContext {
  const priorMessages = priorConversationMessages(args.messages, args.userMessage);
  const reversedPrior = [...priorMessages].reverse();
  const currentService = findRequestedService(services, args.userMessage)?.service;
  const currentName = extractCustomerName(args.userMessage);

  let service = currentService;
  if (!service) {
    for (const message of reversedPrior) {
      const fromServiceTable = findRequestedService(services, message.content)?.service;
      const fromAssistant = message.role === "assistant" ? extractServiceFromAssistant(message.content) : null;
      service = fromServiceTable ?? fromAssistant ?? service;
      if (service) break;
    }
  }

  let day = requestedWeekday(args.userMessage);
  if (!day) {
    for (const message of reversedPrior) {
      day = requestedWeekday(message.content);
      if (day) break;
    }
  }

  let time = extractRequestedTime(args.userMessage);
  if (!time) {
    for (const message of reversedPrior) {
      if (message.role !== "user") continue;
      time = extractRequestedTime(message.content);
      if (time) break;
    }
  }

  let period = extractPeriod(args.userMessage);
  if (!period) {
    for (const message of reversedPrior) {
      if (message.role !== "user") continue;
      period = extractPeriod(message.content);
      if (period) break;
    }
  }

  let name = currentName;
  if (!name) {
    for (const message of reversedPrior) {
      if (message.role !== "user") continue;
      name = extractCustomerName(message.content);
      if (name) break;
    }
  }

  return { service, day, time, period, name };
}

function shouldHandleSchedulingTurn(userMessage: string, lastAssistant: string, context: SchedulingContext) {
  const hasCurrentSchedulingData = Boolean(
    requestedWeekday(userMessage) ||
    extractRequestedTime(userMessage) ||
    extractPeriod(userMessage) ||
    (extractCustomerName(userMessage) && assistantIsScheduling(lastAssistant)),
  );

  return isAppointmentIntent(userMessage) ||
    (assistantIsScheduling(lastAssistant) && (isShortAffirmative(userMessage) || hasCurrentSchedulingData)) ||
    Boolean(context.day && context.time && assistantIsScheduling(lastAssistant));
}

function composeSchedulingAnswer(args: LlmArgs, context: SchedulingContext, serviceList: string) {
  const { agent, sources } = args;
  const { service, day, time, period, name } = context;
  const serviceText = service ? ` para ${service}` : "";
  const lastAssistant = lastAssistantMessage(args.messages);

  if (isShortAffirmative(args.userMessage) && assistantAskedForDay(lastAssistant)) {
    return "Combinado. Me diga o dia e se prefere manhã ou tarde. Se quiser adiantar, me manda seu nome completo também. [SENTIMENT: positivo]";
  }

  if (!day && !time) {
    if (!service) return `Perfeito. Qual serviço você quer agendar? [SENTIMENT: positivo]`;
    return `Perfeito. Qual melhor dia ou período para você? [SENTIMENT: positivo]`;
  }

  if (!day && time) {
    return `Perfeito, ${time}${serviceText}. Qual dia você prefere? [SENTIMENT: positivo]`;
  }

  if (day === "domingo") {
    return `Domingo estamos fechados. Pode ser outro dia da semana? [SENTIMENT: neutro]`;
  }

  if (day && time && !isTimeInsideWindow(sources, day, time)) {
    const range = availabilityRangeForDay(sources, day);
    const rangeText = range ? `Na ${formatWeekdayLabel(day)} atendemos das ${range}. ` : "";
    return `${rangeText}Pode escolher um horário dentro desse período? [SENTIMENT: neutro]`;
  }

  if (day && !time) {
    if (period) {
      return `Perfeito, na ${formatWeekdayLabel(day)} pela ${formatPeriodLabel(period)}. Qual horário você prefere? [SENTIMENT: positivo]`;
    }
    return `${dayAvailabilityAnswer(sources, day)} Me manda seu nome completo para eu deixar encaminhado. [SENTIMENT: positivo]`;
  }

  if (day && time && !service) {
    return `Perfeito, ${formatWeekdayLabel(day)} às ${time}. Qual serviço você quer agendar? [SENTIMENT: positivo]`;
  }

  if (day && time && !name) {
    return `Perfeito, ${formatWeekdayLabel(day)} às ${time}${serviceText}. Me manda seu nome completo para eu deixar encaminhado. [SENTIMENT: positivo]`;
  }

  if (day && time && name) {
    const summary = service
      ? `${service} na ${formatWeekdayLabel(day)} às ${time}`
      : `${formatWeekdayLabel(day)} às ${time}`;
    return `Perfeito, ${firstName(name)}. Vou deixar encaminhado: ${summary}. O sinal de reserva é de R$ 30,00 e será abatido do valor final. [LEAD: nome=${name}] [SENTIMENT: positivo]`;
  }

  return `${agent.fallbackMessage} [SENTIMENT: neutro]`;
}

function dayAvailabilityAnswer(sources: RetrievalHit[], day: string) {
  const fullText = sources.map((source) => source.content).join("\n");

  if (day === "domingo" && /domingo[\s\S]{0,30}fechado/i.test(fullText)) {
    return "Domingo estamos fechados. Pode ser outro dia da semana?";
  }

  if (["segunda", "terca", "quarta", "quinta", "sexta"].includes(day)) {
    const weekdayMatch = fullText.match(/segunda\s+a\s+sexta[\s\S]{0,40}?(\d{1,2}h)\D{1,16}(\d{1,2}h)/i);
    if (weekdayMatch) {
      return `Na ${formatWeekdayLabel(day)} atendemos das ${weekdayMatch[1]} às ${weekdayMatch[2]}. Você prefere manhã ou tarde?`;
    }
  }

  if (day === "sabado") {
    const saturdayMatch = fullText.match(/s[aá].{0,5}bado[\s\S]{0,40}?(\d{1,2}h)\D{1,16}(\d{1,2}h)/i);
    if (saturdayMatch) {
      return `No sábado atendemos das ${saturdayMatch[1]} às ${saturdayMatch[2]}. Você prefere qual horário?`;
    }
  }

  return `Perfeito. Qual período você prefere na ${formatWeekdayLabel(day)}: manhã ou tarde?`;
}

function isUnknownServiceQuestion(message: string) {
  const normalized = normalizeText(message);
  const hasServiceVerb = /\b(faz|fazem|fazer|tem|oferece|trabalha|realiza)\b/.test(normalized);
  const genericServiceListQuestion = isServicesQuestion(message);
  return hasServiceVerb && !genericServiceListQuestion;
}

function stripMarkdownCell(cell: string) {
  return cell.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

export function parseServiceRows(sources: RetrievalHit[]): ServiceRow[] {
  const rows: ServiceRow[] = [];

  for (const source of sources) {
    const lines = source.content.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (!line.includes("|") || /^[\s|:\-]+$/.test(line)) continue;
      const cells = line.split("|").map(stripMarkdownCell).filter(Boolean);
      if (cells.length < 2) continue;

      const joined = normalizeText(cells.join(" "));
      if (joined.includes("servico") && joined.includes("valor")) continue;

      const price = cells.find((cell) => /R\$\s*[\d.,]+/.test(cell));
      if (!price) continue;

      rows.push({
        service: cells[0],
        duration: cells.length >= 3 ? cells[1] : undefined,
        price,
      });
    }
  }

  return rows;
}

function compactServiceList(rows: ServiceRow[]) {
  return rows
    .slice(0, 6)
    .map((row) => {
      const duration = row.duration ? `, ${row.duration}` : "";
      const price = row.price ? ` - ${row.price}` : "";
      return `${row.service}${duration}${price}`;
    })
    .join("; ");
}

function significantTokens(text: string) {
  const stopwords = new Set([
    "faz",
    "fazer",
    "tem",
    "voces",
    "voce",
    "qual",
    "quais",
    "servico",
    "servicos",
    "procedimento",
    "procedimentos",
    "valor",
    "preco",
    "custa",
    "quanto",
    "sessao",
    "media",
  ]);

  return normalizeText(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function findRequestedService(rows: ServiceRow[], message: string) {
  const messageTokens = significantTokens(message);
  if (!messageTokens.length) return null;

  const normalizedMessage = normalizeText(message);
  let best: { row: ServiceRow; score: number } | null = null;

  for (const row of rows) {
    const serviceTokens = significantTokens(row.service);
    const matched = serviceTokens.filter((token) => normalizedMessage.includes(token));
    const score = matched.length / Math.max(1, serviceTokens.length);
    if (matched.length > 0 && (!best || score > best.score)) {
      best = { row, score };
    }
  }

  return best && best.score >= 0.55 ? best.row : null;
}

function formatSpecificServiceAnswer(agent: AgentConfig, row: ServiceRow) {
  const details: string[] = [];
  if (row.duration) details.push(`A sessão dura em média ${row.duration}`);
  if (row.price) details.push(`custa ${row.price}`);

  const detailText = details.length ? ` ${details.join(" e ")}.` : "";

  if (agent.mode === "friendly") {
    return `Sim! Fazemos ${row.service}.${detailText} Quer que eu te ajude a agendar? [SENTIMENT: positivo]`;
  }

  return `Sim, fazemos ${row.service}.${detailText} Quer que eu veja um horário para você? [SENTIMENT: positivo]`;
}

function extractRelevantSentences(sources: RetrievalHit[], matcher: (normalizedSentence: string) => boolean) {
  const sentences = sources
    .flatMap((source) => source.content.split(/(?<=[.!?])\s+|\n+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && matcher(normalizeText(sentence)));

  return Array.from(new Set(sentences));
}

function cleanCustomerSentence(sentence: string) {
  return sentence
    .replace(/^#+\s*/g, "")
    .replace(/^\*\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function paymentAnswer(sources: RetrievalHit[]) {
  const paymentSentences = extractRelevantSentences(
    sources,
    (sentence) => /pagamento|pagamentos|pix|cartao|credito|debito|parcel/.test(sentence),
  );
  if (!paymentSentences.length) return null;

  const text = paymentSentences
    .join(" ")
    .replace(/^pagamentos aceitos:\s*/i, "Aceitamos ")
    .trim();

  return `${text} Quer que eu te ajude a agendar? [SENTIMENT: neutro]`;
}

function hoursAnswer(sources: RetrievalHit[]) {
  const hoursSentences = extractRelevantSentences(
    sources,
    (sentence) => /(\d{1,2}h|segunda|sexta|sabado|domingo|fechado)/.test(sentence) &&
      !/reservar|pedir nome|sinal|servico desejado|melhor periodo/.test(sentence),
  ).map(cleanCustomerSentence);
  if (!hoursSentences.length) return null;

  const dayLines = hoursSentences.filter((sentence) => (
    /^(segunda|sabado|sábado|domingo)/i.test(sentence)
  ));
  const byDay = new Map<string, string>();
  for (const line of dayLines) {
    const normalized = normalizeText(line);
    const day = normalized.includes("segunda")
      ? "segunda"
      : normalized.includes("sabado")
        ? "sabado"
        : normalized.includes("domingo")
          ? "domingo"
          : line;
    const current = byDay.get(day);
    if (!current || (!current.includes(":") && line.includes(":"))) {
      byDay.set(day, line);
    }
  }
  const selected = byDay.size >= 2 ? Array.from(byDay.values()) : hoursSentences.slice(0, 2);

  return `${selected.join("; ")}. Quer que eu veja um horário para você? [SENTIMENT: neutro]`;
}

function cleanSnippet(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !/^[\s|:\-]+$/.test(line))
    .join(" ")
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pickRelevantSnippet(sources: RetrievalHit[]) {
  const snippets = sources
    .map((source) => cleanSnippet(source.content))
    .filter((snippet) => snippet.length > 20);
  const joined = snippets.slice(0, 1).join(" ");
  return joined.length > 260 ? `${joined.slice(0, 260).trim()}...` : joined;
}

function composeLocalFallback(args: LlmArgs) {
  const { agent, sources, faqMatch, playbook, userMessage } = args;
  const opener = modeFallbackTone(agent);
  const priceIntent = wantsPrice(userMessage);
  const services = parseServiceRows(sources);
  const serviceList = compactServiceList(services);
  const requestedService = findRequestedService(services, userMessage);
  const lastAssistant = lastAssistantMessage(args.messages);
  const weekday = requestedWeekday(userMessage);
  const schedulingContext = inferSchedulingContext(args, services);

  if (isGreetingOnly(userMessage)) {
    return `Oi! Eu sou ${agent.name}, assistente virtual da ${agent.company}. Posso te ajudar com serviços, valores ou agendamento. [SENTIMENT: positivo]`;
  }

  if (shouldHandleSchedulingTurn(userMessage, lastAssistant, schedulingContext)) {
    return composeSchedulingAnswer(args, schedulingContext, serviceList);
  }

  if (weekday && (assistantIsScheduling(lastAssistant) || isSchedulingQuestion(userMessage))) {
    return `${dayAvailabilityAnswer(sources, weekday)} Me manda seu nome completo para eu deixar encaminhado. [SENTIMENT: positivo]`;
  }

  if (isShortAffirmative(userMessage) && assistantIsScheduling(lastAssistant)) {
    if (assistantAskedForDay(lastAssistant)) {
      return "Combinado. Me diga o dia e se prefere manhã ou tarde. Se quiser adiantar, me manda seu nome completo também. [SENTIMENT: positivo]";
    }
    return "Perfeito. Qual melhor dia ou período para você? [SENTIMENT: positivo]";
  }

  if (requestedService) {
    return formatSpecificServiceAnswer(agent, requestedService);
  }

  if (isPaymentQuestion(userMessage)) {
    return paymentAnswer(sources) ?? `${agent.fallbackMessage} [SENTIMENT: neutro]`;
  }

  if (isSchedulingQuestion(userMessage)) {
    return hoursAnswer(sources) ?? `${agent.fallbackMessage} [SENTIMENT: neutro]`;
  }

  if (isUnknownServiceQuestion(userMessage)) {
    return `${agent.fallbackMessage} [SENTIMENT: neutro]`;
  }

  if (faqMatch) {
    return `${opener} ${faqMatch.answer} [SENTIMENT: neutro]`;
  }

  if (isServicesQuestion(userMessage) && serviceList) {
    return `${inlineOpener(agent)}, hoje temos: ${serviceList}.[BREAK]Qual serviço você quer agendar? [SENTIMENT: positivo]`;
  }

  if (priceIntent && serviceList) {
    return `${inlineOpener(agent)}, encontrei estes valores: ${serviceList}.[BREAK]Quer que eu te ajude a agendar algum deles? [SENTIMENT: neutro]`;
  }

  const snippet = pickRelevantSnippet(sources);
  if (!snippet) {
    const leadTag = playbook.id === "lead_capture" ? " [LEAD: nome= | email= | telefone=]" : "";
    return `${agent.fallbackMessage}${leadTag} [SENTIMENT: neutro]`;
  }

  if (playbook.id === "escalation") {
    return "Entendi. Vou te encaminhar para a equipe com o contexto da conversa. [ESCALATE] [SENTIMENT: frustrado]";
  }

  return `${opener} ${snippet}[BREAK]Quer que eu te ajude com o próximo passo? [SENTIMENT: neutro]`;
}

export async function generateReply(args: LlmArgs): Promise<{
  rawReply: string;
  provider: "openrouter" | "local-fallback";
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      rawReply: composeLocalFallback(args),
      provider: "local-fallback",
    };
  }

  const baseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const model = process.env.OPENROUTER_MODEL || args.agent.model;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://127.0.0.1:5173",
      "X-Title": "O Agente Local",
    },
    body: JSON.stringify({
      model,
      messages: args.messages,
      temperature: args.agent.temperature,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.warn("OpenRouter falhou; usando fallback local.", response.status, details.slice(0, 240));
    return {
      rawReply: composeLocalFallback(args),
      provider: "local-fallback",
    };
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return {
    rawReply: data.choices?.[0]?.message?.content || composeLocalFallback(args),
    provider: "openrouter",
  };
}

export function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}
