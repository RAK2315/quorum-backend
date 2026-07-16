import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// The state machine. This is where autonomy and escalation split (§2.4):
// within policy -> auto_approved, no human ever sees it;
// over policy -> escalated, sits still until a human decides.
export const record = mutation({
  args: {
    requestId: v.id("requests"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    withinPolicy: v.boolean(),
    reasoning: v.string(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("evaluations", {
      requestId: a.requestId,
      decision: a.decision,
      withinPolicy: a.withinPolicy,
      reasoning: a.reasoning,
    });
    await ctx.db.insert("auditLog", {
      requestId: a.requestId,
      actor: "finance_agent",
      action: "Evaluated request: " + a.decision,
      reasoning: a.reasoning,
    });

    if (a.withinPolicy) {
      // Autonomy where it is safe: no human ever sees this.
      await ctx.db.patch(a.requestId, { status: "auto_approved" });
      await ctx.scheduler.runAfter(0, api.external.fireSlack, {
        requestId: a.requestId,
      });
    } else {
      // A human where it is not.
      await ctx.db.patch(a.requestId, { status: "escalated" });
      await ctx.db.insert("auditLog", {
        requestId: a.requestId,
        actor: "system",
        action: "Escalated to human board",
        reasoning: "Amount exceeds the policy limit and requires a human exception.",
      });
    }
  },
});
