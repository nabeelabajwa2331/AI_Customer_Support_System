# Setup & Requirements

**Project:** AI Customer Support System
**Milestone:** 1 — Setup & Requirements
**Status:** In progress (awaiting approval to start Milestone 2)

---

## 1. Purpose

Build an AI-powered customer support system that lets businesses ingest their
knowledge base, answer customer questions automatically, escalate to a human
when needed, and provide analytics on support conversations.

---

## 2. Verified Environment / Prerequisites

The following were installed and verified during Milestone 1:

| Tool           | Version                | Notes                                             |
| -------------- | ---------------------- | ------------------------------------------------- |
| Node.js        | v26.5.1                | Runtime for backend/frontend                      |
| npm            | 11.17.0                | Package manager (fallback)                        |
| pnpm           | 12.9.1                 | Preferred package manager                         |
| Git            | 2.55.0.windows.3       | Version control                                   |
| Python         | 3.14.7                 | Utility/scripting only                            |
| PostgreSQL     | 18.6                   | Windows service `postgresql-x64-18` running       |

Repository: `https://github.com/nabeelabajwa2331/AI_Customer_Support_System.git`

PostgreSQL authentication is configured with `scram-sha-256` for all
local/host connections (no `trust` entries). The original `pg_hba.conf`
(backed up to the Desktop) matches the current live file.

---

## 3. Functional Requirements

1. **Knowledge ingestion** — Upload/ingest documents (FAQ, help articles,
   PDFs) and index them for retrieval.
2. **Conversational support** — Chat interface that answers questions using
   retrieved knowledge, with conversation history.
3. **AI answers** — LLM-backed responses grounded in retrieved context (RAG)
   with citations to source documents.
4. **Human handoff / escalation** — Route unresolved or sensitive queries to a
   human agent.
5. **Ticket management** — Create, view, update, and close support tickets.
6. **Admin dashboard** — Manage knowledge base, view conversations, and
   configure the assistant.
7. **Analytics** — Volume, resolution rate, deflection rate, and satisfaction.
8. **Auth & roles** — Admin and agent roles with secure authentication.
9. **Audit & logging** — Log key actions and AI interactions.

## 4. Non-Functional Requirements

- **Security:** secrets only in `.env`; password hashing; input validation;
  least-privilege DB access.
- **Performance:** p95 API latency target < 500 ms for non-AI endpoints.
- **Reliability:** graceful handling of AI provider failures with fallback.
- **Observability:** structured logging with request IDs.
- **Maintainability:** TypeScript, linting/formatting, typed API contracts.
- **Cost control:** token/usage limits per request and per tenant.

---

## 5. Recommended Architecture

```
┌──────────────────────────────┐
│        Frontend (Web)        │  Next.js (React + TypeScript) + Tailwind
│  Chat UI · Admin Dashboard   │  Talks to backend via REST/JSON
└──────────────┬───────────────┘
               │ HTTPS
┌──────────────▼───────────────┐
│          Backend API         │  Node.js + TypeScript (NestJS or Express)
│  Auth · Tickets · Chat · KB  │  Validation, RBAC, rate limiting
└───┬───────────┬───────────┬──┘
    │           │           │
    │           │           └──────────────┐
    │           │                          │
┌───▼────┐  ┌───▼─────────┐      ┌─────────▼──────────┐
│Postgres│  │ Vector store│      │  AI / LLM Provider │
│ 18     │  │ (pgvector or│      │  (OpenAI/Anthropic)│
│ Prisma │  │ Pinecone)   │      │  Embeddings + chat │
└────────┘  └─────────────┘      └────────────────────┘
```

### Recommended stack

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Backend:** Node.js + TypeScript (NestJS preferred; Express acceptable)
- **Database:** PostgreSQL 18
- **ORM/Migrations:** Prisma
- **Vector search:** pgvector (co-located with Postgres) initially
- **AI:** Provider-agnostic LLM client with embeddings for RAG
- **Auth:** JWT/session-based auth with role-based access control
- **Package manager:** pnpm

### Suggested repository layout

```
AI_Customer_Support_System/
├─ apps/
│  ├─ web/          # Next.js frontend
│  └─ api/          # Backend service
├─ packages/
│  └─ shared/       # Shared types/utils
├─ prisma/          # Schema + migrations
├─ docs/            # Documentation
├─ .env.example
└─ .gitignore
```

---

## 6. Milestone Roadmap

- **M1 — Setup & Requirements** (current): tooling, DB, repo, docs.
- **M2 — Project scaffolding:** monorepo, app skeletons, Prisma schema.
- **M3 — Data model & API:** core entities, CRUD, auth.
- **M4 — AI/RAG pipeline:** ingestion, embeddings, retrieval, chat.
- **M5 — Frontend:** chat + admin dashboard.
- **M6 — Hardening:** tests, logging, analytics, deployment.

---

## 7. Open Items / Decisions Pending

- Confirm monorepo tooling (pnpm workspaces vs. single app).
- Confirm backend framework (NestJS vs. Express/Next API routes).
- Confirm vector store (pgvector vs. managed service).
- Confirm AI provider and model.
- Decide authentication strategy (self-hosted JWT vs. provider).
