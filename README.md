# Agente Inteligente para Atendimento Comercial

Protótipo web de um agente inteligente personalizável com **IA generativa** e **RAG** para apoiar o atendimento comercial de pequenas empresas.

O sistema permite configurar um agente virtual, cadastrar uma base de conhecimento da empresa e testar conversas em uma interface web. A proposta é automatizar o primeiro atendimento ao cliente, respondendo dúvidas frequentes de forma rápida, padronizada e contextualizada.

---

## Sobre o projeto

Pequenas empresas recebem diariamente perguntas repetidas sobre produtos, serviços, preços, formas de pagamento, horários de funcionamento, localização e agendamentos.

O atendimento manual dessas mensagens pode gerar demora, inconsistência nas respostas e perda de oportunidades comerciais.

Este projeto propõe uma solução baseada em Inteligência Artificial para atuar como um atendente virtual de primeiro nível, capaz de:

- responder dúvidas frequentes;
- consultar uma base de conhecimento cadastrada;
- manter uma linguagem adequada ao perfil da empresa;
- evitar respostas inventadas;
- encaminhar casos sensíveis para atendimento humano.

---

## Objetivo

Desenvolver um agente inteligente personalizável baseado em **IA generativa** e **RAG** para auxiliar pequenas empresas no atendimento comercial, permitindo respostas automáticas contextualizadas a partir de uma base de conhecimento cadastrada.

---

## Funcionalidades

- Configuração do agente virtual;
- Definição de nome, tom de voz e instruções;
- Cadastro da base de conhecimento da empresa;
- Cadastro e gerenciamento de perguntas frequentes;
- Chat para teste do agente;
- Recuperação de informações relevantes antes da resposta;
- Geração de respostas com IA generativa;
- Integração opcional com modelo generativo via OpenRouter;
- Fallback local quando a API externa não está configurada;
- Histórico de conversas;
- Identificação de perguntas fora da base;
- Encaminhamento para atendimento humano;
- Regras para reduzir alucinações;
- Testes automatizados e manuais.

---

## Tecnologias utilizadas

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- lucide-react
- Fetch API

### Backend

- Node.js
- Express
- TypeScript
- CORS
- Zod

### Persistência

- Arquivo JSON local para armazenamento de:
  - configurações do agente;
  - base de conhecimento;
  - perguntas frequentes;
  - mensagens;
  - histórico de conversas;
  - memória local.

### Inteligência Artificial

- OpenRouter
- Modelo generativo configurável
- RAG lexical local
- Prompt engineering
- Fallback local baseado em regras

### Processamento de documentos

- pdfjs-dist
- mammoth
- exceljs

### Testes e qualidade

- Vitest
- Testing Library
- Playwright
- ESLint
- TypeScript

---

## Como funciona

O sistema utiliza uma arquitetura baseada em **RAG**, ou seja, geração aumentada por recuperação.

Antes de gerar uma resposta, o agente busca informações relevantes na base de conhecimento cadastrada pela empresa. Em seguida, esses trechos são enviados como contexto para o modelo generativo.

Fluxo simplificado:

```text
Cliente envia uma mensagem
        ↓
Backend recebe a requisição
        ↓
Sistema busca informações relevantes na base
        ↓
Monta o prompt com regras, contexto e mensagem do usuário
        ↓
Chama o modelo generativo via OpenRouter ou usa fallback local
        ↓
Resposta é retornada para o chat
