# O Agente Local

Réplica simplificada do projeto original `O Agente`, focada em um único agente local para atendimento comercial de pequenas empresas.

## O que foi mantido do projeto original

- React + TypeScript + Vite no frontend.
- Prompt em camadas: segurança, identidade, playbook, personalização e contexto dinâmico.
- RAG com chunking, prioridade de fontes e preservação de tabelas de preço.
- Playbooks de vendas, suporte, captura de lead, escalonamento e geral.
- Skills essenciais: saudação, FAQ, escalonamento, lead, sentimento e follow-up.
- OpenRouter como gateway opcional para IA generativa.

## O que foi simplificado

- Sem Supabase, login, multi-tenant, cobrança, WhatsApp, Evolution API ou painel admin.
- Persistência em `data/store.json`.
- RAG local por busca lexical em português, sem pgvector.
- Fallback local quando `OPENROUTER_API_KEY` não estiver configurada.

## Rodar localmente

```bash
npm install
copy .env.example .env
npm run dev
```

Abra `http://127.0.0.1:5173`.

Para usar IA generativa real, preencha `OPENROUTER_API_KEY` no `.env`. Sem a chave, o app roda em modo demonstrativo com respostas locais baseadas na base de conhecimento.

## Scripts

```bash
npm run dev      # API local + Vite
npm run build    # checagem TypeScript + build web
npm run test     # testes do RAG local
```

## Estrutura

- `src/`: interface web.
- `server/`: API local, RAG, playbooks, prompt e chamada de LLM.
- `shared/`: tipos compartilhados.
- `data/store.json`: agente, base de conhecimento, FAQ, mensagens e memória local.
