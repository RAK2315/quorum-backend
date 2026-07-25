import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// One request by id.
export const get = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    return await ctx.db.get(requestId);
  },
});

// All requests, newest first.
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("requests").order("desc").collect();
  },
});

// The workflow trigger. Inserts the request, then hands off to the Marketing
// agent, which writes its own pitch with the LLM before Finance evaluates it.
// No human moves data between the agents (pillar 1). The `justification` arg
// is kept only as a fallback if the Marketing agent's LLM call fails.
export const submit = mutation({
  args: {
    campaign: v.string(),
    amount: v.number(),
    justification: v.string(),
  },
  handler: async (ctx, args) => {
    const requestId = await ctx.db.insert("requests", {
      campaign: args.campaign,
      amount: args.amount,
      requestedBy: "marketing_agent",
      justification: args.justification,
      status: "pending_finance",
    });
    // Write the submission audit row transactionally, in the same mutation as
    // the request. This guarantees every request always has a trail even if the
    // scheduled Marketing agent action later fails (constraint 6), and lights up
    // the audit feed instantly instead of after the Groq round-trip.
    await ctx.db.insert("auditLog", {
      requestId,
      actor: "marketing_agent",
      action: "Submitted budget request of Rs " + args.amount + " for " + args.campaign,
      reasoning: args.justification,
    });
    // Short delay so the request card appears first, then the Marketing agent
    // "writes up" its pitch a moment later (demo readability).
    await ctx.scheduler.runAfter(600, api.agents.runMarketingAgent, { requestId });
    return requestId;
  },
});

// Records the Marketing agent's LLM-written pitch and hands the request to the
// Finance agent. This is a mutation because it writes to the DB and schedules
// the next agent; the LLM call happened in the action that calls this.
export const recordMarketingPitch = mutation({
  args: { requestId: v.id("requests"), pitch: v.string() },
  handler: async (ctx, { requestId, pitch }) => {
    const req = await ctx.db.get(requestId);
    if (!req) {
      throw new Error("Request not found: " + requestId);
    }
    await ctx.db.patch(requestId, { justification: pitch });
    await ctx.db.insert("auditLog", {
      requestId,
      actor: "marketing_agent",
      action: "Drafted campaign justification",
      reasoning: pitch,
    });
    // Pace before Finance so the two agents read as distinct beats.
    await ctx.scheduler.runAfter(1500, api.agents.runFinanceAgent, { requestId });
  },
});
