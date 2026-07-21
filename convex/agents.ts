import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Plain fetch to Groq. Text only, never decisions (CLAUDE.md §2.2).
async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }
  // System message keeps the model in "plain reasoning" mode: no email format,
  // no greetings/signatures, no [bracketed] placeholders. It writes the
  // explanation only; the decision is always made in code.
  const system =
    "You are the Finance department agent in an automated budget-approval system. " +
    "You write only the short, human-readable justification for a decision that has " +
    "already been made by a deterministic policy engine. Reply with exactly two " +
    "sentences of plain prose in the first person. Never write an email, subject line, " +
    "greeting, or signature. Never use bracketed placeholders such as [Name] or " +
    "[Your Name]. Do not address anyone; just state the reasoning.";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 120,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error("Groq returned " + response.status);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned no text");
  }
  return text.trim();
}

// The Finance agent. Reads the request and the policy, decides IN CODE,
// asks Groq only for the human-readable reasoning, hands off to the state
// machine. Actions never touch ctx.db (CLAUDE.md §8).
export const runFinanceAgent = action({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const req = await ctx.runQuery(api.requests.get, { requestId });
    if (!req) {
      throw new Error("Request not found: " + requestId);
    }
    const policy = await ctx.runQuery(api.policies.forCategory, {
      category: "marketing_campaign",
    });
    if (!policy) {
      throw new Error("Policy not found. Run seed:run first.");
    }

    // THE DECISION IS CODE. Never the LLM. See CLAUDE.md §2.2.
    const withinPolicy = req.amount <= policy.limit;

    // The LLM writes ONLY the explanation.
    let reasoning: string;
    try {
      reasoning = await callGroq(
        "A " + req.campaign + " campaign requested Rs " + req.amount +
        ". The policy limit is Rs " + policy.limit + ", so this request is " +
        (withinPolicy ? "within" : "over") + " the limit and has therefore been " +
        (withinPolicy ? "approved" : "rejected") +
        " by the policy engine. Write exactly two sentences explaining this outcome."
      );
    } catch (e) {
      // Fallback so the workflow NEVER stalls on model latency (constraint 6).
      reasoning = withinPolicy
        ? "Request of Rs " + req.amount + " is within the Rs " + policy.limit + " policy limit. Approved automatically."
        : "Request of Rs " + req.amount + " exceeds the Rs " + policy.limit + " policy limit. Rejected and escalated for human review.";
    }

    await ctx.runMutation(api.evaluations.record, {
      requestId,
      decision: withinPolicy ? "approve" : "reject",
      withinPolicy,
      reasoning,
    });
  },
});
