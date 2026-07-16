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

// The Marketing agent submits a budget request. This is the workflow trigger:
// insert as pending_finance, write the audit row, then hand off to the
// Finance agent via the scheduler. No human moves this data (pillar 1).
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
    await ctx.db.insert("auditLog", {
      requestId,
      actor: "marketing_agent",
      action: "Submitted budget request of Rs " + args.amount + " for " + args.campaign,
      reasoning: args.justification,
    });
    await ctx.scheduler.runAfter(0, api.agents.runFinanceAgent, { requestId });
    return requestId;
  },
});
