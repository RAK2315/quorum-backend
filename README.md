# Quorum

**An AI-native enterprise operating system.** The departments are AI agents. The humans are the board of directors. Agents coordinate work on their own, humans approve the decisions that carry real risk, and every action is written down with the reasoning behind it.

A *quorum* is the minimum number of members needed to make a decision valid. That is the whole thesis: autonomous agents, plus a human board, together.

Built for the **Cognitive Chaos 2026 Hackathon** (Convex Track, Open Innovation) by **Team Sigmoid**.

> This repository is the **backend**: all durable state and business logic, running on Convex. The frontend is a board dashboard built and deployed on EnterPro that calls these functions over one public URL. Frontend repo: `github.com/RAK2315/QuorumGovernanceDashboard`.

## Team Sigmoid

- **Rehaan** (Team Leader)
- **Krishna**
- **Aditya**

## The problem

Every company runs on tools that do not talk to each other. Engineering lives in GitHub, Sales in a CRM, HR in spreadsheets, Finance in email threads. The only thing wiring them together is a human, copying information from one tool into the next, chasing approvals, and making the same small decisions over and over. The human is the integration layer.

That causes three things: information silos, slow execution because everything waits on a person, and no record of why a decision was made because it happened in a DM or a hallway.

Existing fixes do not solve it. Zapier and RPA move data along rigid wires but make no decisions. Chatbots are an interface, not a system that acts. Neither has a deliberate human approval gate or an auditable reasoning trail.

## What we built

Quorum runs a real cross-department workflow with two AI agents, a deterministic policy engine, a human approval gate, a real external side effect, and a full audit trail. We picked **Marketing and Finance** and went deep on one workflow rather than building many shallow agents.

The conflict is quantitative and deterministic on purpose: Marketing requests a budget, Finance checks it against a policy limit, and if it is over the limit it must be rejected and escalated to the human board. It fires on every run because it is a number comparison, not a model guess.

## The three pillars

The hackathon brief names three requirements. Quorum satisfies each one:

1. **Agents coordinate work autonomously.** The Marketing agent submits a request and the Finance agent picks it up and evaluates it, with no human moving data between them.
2. **Humans stay in the loop for real decisions.** An over-limit request pauses in an `escalated` state and does not advance until a human approves, rejects, or overrides it.
3. **Every action is traceable.** For any action, a human can open the audit log and see what happened, which agent did it, and the reasoning behind it, without asking the agents.

## Depth, not breadth

The brief is explicit that breadth earns nothing, and warns against building many shallow department agents, a chatbot with a nice UI, or a demo that only works because a human secretly clicks things. We took that seriously and went deep on one workflow. Here is where the depth actually is.

- **A real, deterministic policy engine, not a prompt.** The approve or reject decision is `amount <= limit` in code. It is not an LLM guess, so the disagreement fires on every single run and is identical in the dry run and the live run. This is the difference between a demo that might work and a system that always does.

- **Two genuinely different paths, and the line between them is designed.** Within-policy requests are auto-approved with no human ever involved. Only policy exceptions escalate to the board. Building the auto-approve branch even though the headline demo walks the escalation path is the point: it proves the system acts on its own where it is safe and stops for a human where it is not, on purpose.

- **The human gate is a transactional state transition, not a button.** An escalated request sits in that state indefinitely and nothing advances it except an external human decision recorded as a Convex mutation. The gate is satisfied by the backend, not by the UI.

- **A complete, queryable reasoning trail.** Every actor (marketing_agent, finance_agent, human, system) writes an audit row carrying reasoning, not just a status change. For any single request you can pull its full decision timeline in order: submitted, evaluated and why, escalated and why, human decision and the note, side effect fired. That directly answers the brief's own question about where a new team member looks to understand last week's decisions.

- **Arbitrary input, not a canned amount.** The console accepts any campaign name and any amount, so a judge can type their own number and watch the same policy engine react live. Under the limit auto-approves, over the limit escalates. Nothing is hardcoded to make the demo work.

- **Honest, visible use of the LLM.** The reasoning prose in every evaluation is generated live by Groq and labelled as such in the interface. The model writes language; it never makes the decision. This separation is shown, not just claimed.

- **Built to survive a bad network.** Groq down, Slack down, or flaky venue wifi, and the workflow still reaches its end state through wrapped calls and templated fallbacks. Reliability is a feature here, not an afterthought.

- **Aggregate oversight.** A live overview counts total requests, how many are awaiting the board, how many completed, and how many were rejected, so a human can see the health of the system at a glance, which is how you notice when an agent starts making bad calls.

None of this is a second or third agent, a login system, or an unrelated workflow. It is the same one workflow, made real and made deep.

## The decision is code, the reasoning is the LLM

This is the most important design decision in the project.

Both agents use the LLM (Groq, `llama-3.1-8b-instant`) for **language**: the Marketing agent writes its own persuasive pitch for the campaign, and the Finance agent writes the reasoning for its evaluation. Neither uses the LLM to **decide**. The policy check is `amount <= limit` in plain code. It is deterministic, so the disagreement fires on every run and never depends on a model behaving correctly under pressure. If any Groq call fails, a templated fallback string is used and the workflow still completes.

This is not a shortcut. Real systems put policy in code and use models for language. The decision is never made by the model.

## Architecture

```
                          [ trigger ]
                               |
                     Marketing agent (submits)
                               |
                      Finance agent (action)
                               |
                    policy check IN CODE: amount <= limit
                          /              \
                    within                over
                       |                    |
                 auto_approved          escalated
                       |                    |
                       |            Human board (dashboard)
                       |             approve / uphold
                       |                    |
                       +------> ctx.scheduler -> Slack (real)
                                        |
                        every step writes to auditLog (live feed)
```

### Layer ownership

| Layer | Owner |
|---|---|
| Schema, agents, policy engine, state machine, scheduler, audit log | Convex |
| Reasoning prose | Groq (`llama-3.1-8b-instant`), text only, never decisions |
| External side effect | Slack incoming webhook (one POST, no OAuth) |
| Human gate (the decision) | Convex mutation `approvals.humanDecide` |
| Deployment | Convex cloud (`npx convex deploy`) |

### The Convex action / mutation rule

Actions can call external APIs (Groq, Slack) but cannot touch the database. Mutations are transactional and reactive but cannot call `fetch`. The pattern throughout is:

```
action (LLM / HTTP)  ->  mutation (DB write)  ->  reactive query (UI updates itself)
```

Actions read with `ctx.runQuery` and write with `ctx.runMutation`. They never touch `ctx.db`.

## Why Convex is load-bearing

Convex is not a database bolted onto the side. It is the operating system:

- **Durable organisational state** (policies, evaluations, approvals, audit history) lives in Convex. Runtime state stays in the orchestrator. That split is deliberate.
- **The human approval gate is a Convex mutation**, a transactional state transition, not UI decoration.
- **The dashboard is real-time with zero polling and zero webhooks** because Convex queries are reactive. On any other stack the human-in-the-loop panel needs a websocket layer or a polling loop. Here it is free, and that is the reason the gate is real-time at all.
- **External actions fire through `ctx.scheduler`**, so the side effect is scheduled infrastructure, not a fetch stapled to a button.

Remove Convex and you do not just lose a database. You lose the gate, the traceability feed, and the scheduler.

## The workflow, end to end

1. **Marketing agent submits a budget request.** It uses the LLM to write its own persuasive pitch for the campaign, then hands the request to the Finance agent. No human moves the data between them.
2. **Finance agent evaluates it against policy.** Code compares the amount to the limit. Groq writes the reasoning prose, with a templated fallback if it fails.
3. **The state machine splits.** Within policy goes to `auto_approved` and fires Slack with no human involved. Over policy goes to `escalated` and waits.
4. **A human overrides.** The board approves the exception with a note, or upholds the rejection.
5. **Convex fires a real Slack message** through the scheduler.
6. **The whole chain is readable** in the live audit feed, with every actor and every reason.

There is a small deliberate pacing delay between steps so the workflow reads as distinct beats during a live demo. The work is real; only the timing is spaced.

## Schema

Six tables, each mapping to a concept: policies are the org rules, requests are work, evaluations are agent decisions, approvals are board decisions, auditLog is the institutional memory, externalActions are real-world effects.

| Table | Purpose | Key fields |
|---|---|---|
| `policies` | the org rules | `category`, `limit`, `description` |
| `requests` | units of work | `campaign`, `amount`, `requestedBy`, `justification`, `status` |
| `evaluations` | agent decisions | `requestId`, `decision`, `withinPolicy`, `reasoning` |
| `approvals` | board decisions | `requestId`, `humanDecision`, `note` |
| `auditLog` | institutional memory | `requestId`, `actor`, `action`, `reasoning` |
| `externalActions` | real-world effects | `requestId`, `type`, `status`, `detail` |

The `status` union is the state machine. Every transition is one of these literals, and there is no free-text status anywhere:

```
pending_finance -> auto_approved   -> action_fired
                -> escalated -> human_approved -> action_fired
                             -> rejected
```

## Functions the frontend calls

| Function | Type | Purpose |
|---|---|---|
| `requests:submit` | mutation | Marketing submits a request; schedules the Finance agent |
| `requests:listActive` | query | All requests, newest first |
| `auditLog:recent` | query | The live audit feed |
| `approvals:humanDecide` | mutation | The human gate (override or uphold) |
| `policies:forCategory` | query | Policy lookup (the limit) |

## Files

```
convex/
  schema.ts        tables and the status state machine
  seed.ts          policy row (idempotent) plus a reset helper for a clean demo
  policies.ts      policy lookup
  requests.ts      submit plus queries; schedules the Marketing agent
  agents.ts        the Marketing and Finance agent actions (Groq language, decision in code)
  evaluations.ts   the state machine (auto-approve vs escalate)
  approvals.ts     the human gate
  external.ts      the real Slack side effect (fireSlack plus markFired)
```

## Reliability

The demo completes even when the network fails, which is a hard requirement for a live venue:

- If Groq is slow or down, the try/catch fallback writes a templated reasoning string and the workflow finishes.
- If Slack is down, the external action is marked `failed` and the request still reaches its end state.
- The policy decision is code, so the core disagreement fires on every run regardless of the model.

## Running locally

```
npm install
npx convex dev            # pushes functions and watches for changes
npx convex run seed:run   # insert the policy row (idempotent)
```

Server-side secrets (`GROQ_API_KEY`, `SLACK_WEBHOOK_URL`) are set in the Convex dashboard, never in code. The client URL is public by design, like a Firebase config, and the browser never sees any secret because every external call happens inside a Convex action.

To clear all workflow rows before a demo (the policy row is kept):

```
npx convex run seed:reset
```

## Deployment

```
npx convex deploy
```

Production and dev deployments have separate environment variables, so `GROQ_API_KEY` and `SLACK_WEBHOOK_URL` are set on both.

## Links

- Backend (this repo): Convex functions and schema
- Frontend: `github.com/RAK2315/QuorumGovernanceDashboard` (EnterPro, Vite + React)
- Submitted project URL: the EnterPro deployment
