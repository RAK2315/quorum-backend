# Quorum — backend (Convex)

**An AI-native enterprise operating system.** The departments are AI agents; the humans are the board of directors. Agents coordinate work autonomously, humans approve the decisions that carry real risk, and every action is recorded with its reasoning.

Built for the **Cognitive Chaos 2026 Hackathon** (Convex Track) by **Team Sigmoid**.

> This repo is the **backend**: all durable state and business logic, on Convex. The frontend (a small board dashboard) is built and deployed on EnterPro and calls these functions over one public URL.

## The workflow

1. **Marketing agent** submits a budget request (₹75,000 for a campaign).
2. **Finance agent** picks it up autonomously — no human moves the data — and evaluates it against policy.
3. **The policy check is code, not an LLM:** `amount <= limit`. The LLM (Groq) only writes the human-readable reasoning for the log. This makes the decision deterministic and the demo reliable.
4. Within policy → **auto-approved**, no human involved. Over policy → **escalated** to the human board.
5. A **human overrides** (approve the exception, or uphold the rejection) — this is a Convex mutation, the real human gate.
6. On approval, Convex fires a **real Slack message** via `ctx.scheduler`.
7. Every step writes to a live **audit log** with actor + reasoning.

## Why Convex is load-bearing

- **Durable org state** (policies, evaluations, approvals, audit history) lives in Convex.
- **The human approval gate is a Convex mutation** — a transactional state transition, not UI decoration.
- **The dashboard is real-time with zero polling** because Convex queries are reactive.
- **External actions fire through `ctx.scheduler`**, so the side effect is scheduled infrastructure.

Remove Convex and you don't just lose a database — you lose the gate, the traceability feed, and the scheduler.

## Architecture rule (Convex)

`action` (LLM / HTTP) → `mutation` (DB write) → reactive `query` (UI updates itself). Actions never touch the DB; they use `ctx.runQuery` / `ctx.runMutation`.

## Functions the frontend calls

| Function | Type | Purpose |
|---|---|---|
| `requests:submit` | mutation | Marketing submits a request; schedules the Finance agent |
| `requests:listActive` | query | All requests, newest first |
| `auditLog:recent` | query | The live audit feed |
| `approvals:humanDecide` | mutation | The human gate (override / uphold) |
| `policies:forCategory` | query | Policy lookup (the ₹50,000 limit) |

## Files

```
convex/
  schema.ts        tables (policies, requests, evaluations, approvals, auditLog, externalActions)
  seed.ts          policy row + reset helper
  policies.ts      policy lookup
  requests.ts      submit + queries
  agents.ts        the Finance agent action (Groq reasoning, decision in code)
  evaluations.ts   the state machine (auto-approve vs escalate)
  approvals.ts     the human gate
  external.ts      the real Slack side effect
```

## Running locally

```
npm install
npx convex dev        # pushes functions, watches for changes
npx convex run seed:run   # insert the policy row (idempotent)
```

Server-side secrets (`GROQ_API_KEY`, `SLACK_WEBHOOK_URL`) are set in the Convex dashboard, never in code. The workflow completes even if Groq or Slack is down — both are wrapped with fallbacks.
