import type {
  FaqItem,
  KnowledgeChunk,
  KnowledgeSource,
  RetrievalHit,
  SourceType,
} from "../shared/types";

const SOURCE_PRIORITY: Record<SourceType, number> = {
  document: 100,
  manual: 90,
  website: 70,
  social: 10,
};

const STOPWORDS = new Set([
  "a",
  "o",
  "os",
  "as",
  "um",
  "uma",
  "uns",
  "umas",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "por",
  "para",
  "pra",
  "com",
  "sem",
  "que",
  "qual",
  "quais",
  "quanto",
  "quantos",
  "quando",
  "como",
  "onde",
  "eu",
  "voce",
  "voces",
  "ele",
  "ela",
  "eles",
  "elas",
  "e",
  "ou",
  "mas",
  "se",
  "tem",
  "ter",
  "sou",
  "ser",
  "me",
  "te",
  "minha",
  "meu",
  "sua",
  "seu",
]);

export function sourcePriority(type: SourceType) {
  return SOURCE_PRIORITY[type] ?? 50;
}

export function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function tokenize(text: string) {
  return normalizeText(text)
    .replace(/[^\p{L}\p{N}\s$,.]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function tokenVariants(token: string) {
  const variants = new Set([token]);
  if (token.endsWith("s") && token.length > 4) variants.add(token.slice(0, -1));
  if (token.endsWith("es") && token.length > 5) variants.add(token.slice(0, -2));
  if (token.endsWith("oes") && token.length > 5) variants.add(`${token.slice(0, -3)}ao`);
  return Array.from(variants);
}

type LineKind = "strong" | "weak" | "prose";

function classifyLine(line: string): LineKind {
  const trimmed = line.trim();
  if (!trimmed) return "prose";

  const pipeCount = (line.match(/\|/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;
  const hasCurrency = /R\$\s*[\d.,]+/.test(line);
  const numericCount = (line.match(/\d+[.,]?\d*/g) || []).length;
  const hasAlignment = tabCount >= 1 || /\s{3,}/.test(line);

  if (pipeCount >= 2 && /^[\s|:\-]+$/.test(trimmed)) return "weak";
  if (hasCurrency && (pipeCount >= 1 || hasAlignment)) return "strong";
  if (pipeCount >= 2 && numericCount >= 1) return "strong";
  if (hasAlignment && numericCount >= 2) return "strong";
  if (pipeCount >= 2 || tabCount >= 2) return "weak";

  return "prose";
}

function splitRecursive(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  for (const sep of ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "]) {
    const idx = text.lastIndexOf(sep, maxChars);
    if (idx > 0) {
      const head = text.slice(0, idx + sep.length).trimEnd();
      const tail = text.slice(idx + sep.length);
      return [head, ...splitRecursive(tail, maxChars)];
    }
  }

  return [text.slice(0, maxChars), ...splitRecursive(text.slice(maxChars), maxChars)];
}

function groupSections(text: string) {
  const classified = text.split("\n").map((line) => ({ line, kind: classifyLine(line) }));
  const sections: Array<{ text: string; isTable: boolean }> = [];
  let i = 0;

  while (i < classified.length) {
    if (classified[i].kind === "prose") {
      const buf: string[] = [];
      while (i < classified.length && classified[i].kind === "prose") {
        buf.push(classified[i].line);
        i++;
      }
      const joined = buf.join("\n").trim();
      if (joined) sections.push({ text: joined, isTable: false });
      continue;
    }

    const start = i;
    let strongCount = 0;
    let weakCount = 0;
    while (
      i < classified.length &&
      (classified[i].kind === "strong" || classified[i].kind === "weak")
    ) {
      if (classified[i].kind === "strong") strongCount++;
      if (classified[i].kind === "weak") weakCount++;
      i++;
    }

    const textBlock = classified.slice(start, i).map((row) => row.line).join("\n").trim();
    if (textBlock) {
      sections.push({
        text: textBlock,
        isTable: strongCount >= 1 && strongCount + weakCount >= 2,
      });
    }
  }

  return sections;
}

export function chunkText(text: string, maxChars = 1000, overlapChars = 150) {
  const sections = groupSections(text);
  const chunks: string[] = [];

  for (const section of sections) {
    if (section.isTable && section.text.length <= 2000) {
      chunks.push(section.text);
      continue;
    }

    const pieces = splitRecursive(section.text, Math.max(350, maxChars - overlapChars));
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i].trim();
      if (!piece) continue;
      if (i === 0 || chunks.length === 0) {
        chunks.push(piece);
        continue;
      }
      const tail = chunks[chunks.length - 1].slice(-overlapChars);
      const firstSpace = tail.search(/\s/);
      const alignedTail = firstSpace >= 0 ? tail.slice(firstSpace + 1).trim() : "";
      chunks.push(`${alignedTail} ${piece}`.trim());
    }
  }

  return chunks;
}

export function buildChunksForSource(source: KnowledgeSource): KnowledgeChunk[] {
  return chunkText(source.content).map((content, chunkIndex) => ({
    id: `${source.id}-chunk-${chunkIndex}`,
    sourceId: source.id,
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    sourcePriority: source.sourcePriority,
    content,
    chunkIndex,
    createdAt: source.createdAt,
  }));
}

function scoreText(queryTokens: string[], text: string) {
  const normalized = normalizeText(text);
  const terms = new Set(tokenize(text));
  const matchedTerms = queryTokens.filter((token) => (
    tokenVariants(token).some((variant) => terms.has(variant) || normalized.includes(variant))
  ));
  const exactPhraseBoost = queryTokens.length > 1 && normalized.includes(queryTokens.join(" ")) ? 2 : 0;
  const numericBoost = /\d|r\$/.test(normalized) && queryTokens.some((token) => /preco|valor|custa|reais|horario|agenda/.test(token))
    ? 1.4
    : 0;

  return {
    matchedTerms,
    score: matchedTerms.length * 2 + exactPhraseBoost + numericBoost,
  };
}

export function searchKnowledge(chunks: KnowledgeChunk[], query: string, limit = 8): RetrievalHit[] {
  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0) return [];

  const scored = chunks
    .map((chunk) => {
      const result = scoreText(queryTokens, chunk.content);
      const priorityBoost = chunk.sourcePriority / 100;
      return {
        ...chunk,
        matchedTerms: result.matchedTerms,
        score: Number((result.score + priorityBoost).toFixed(3)),
      };
    })
    .filter((hit) => hit.score > hit.sourcePriority / 100)
    .sort((a, b) => b.score - a.score || b.sourcePriority - a.sourcePriority)
    .slice(0, limit);

  if (scored.length >= 3 || chunks.length < 5) return scored;

  const fallback = [...chunks]
    .sort((a, b) => b.sourcePriority - a.sourcePriority || b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.min(limit, 8))
    .map((chunk) => ({
      ...chunk,
      score: Number((chunk.sourcePriority / 100).toFixed(3)),
      matchedTerms: [],
    }));

  return fallback;
}

export function findFaqMatch(faqs: FaqItem[], query: string): FaqItem | null {
  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0) return null;

  let best: { faq: FaqItem; score: number } | null = null;
  for (const faq of faqs.filter((item) => item.isActive)) {
    const questionScore = scoreText(queryTokens, faq.question);
    const answerScore = scoreText(queryTokens, faq.answer);
    const questionRatio = questionScore.matchedTerms.length / Math.max(1, queryTokens.length);
    const finalScore = questionScore.score * 1.6 + answerScore.score * 0.25 + questionRatio * 4;
    if (!best || finalScore > best.score) {
      best = { faq, score: finalScore };
    }
  }

  return best && best.score >= 4 ? best.faq : null;
}
