import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// The board's decision for a request, if any. Used to enrich the Slack message.
export const forRequest = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .order("desc")
      .first();
  },
});

// THE HUMAN GATE. An escalated request sits still forever until this runs;
// nothing else advances it (pillar 2). The frontend button, whenever it
// exists, is only a caller of this mutation.
export const humanDecide = mutation({
  args: {
    requestId: v.id("requests"),
    decision: v.union(
      v.literal("override_approve"),
      v.literal("uphold_reject"),
    ),
    note: v.string(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("approvals", {
      requestId: a.requestId,
      humanDecision: a.decision,
      note: a.note,
    });
    await ctx.db.insert("auditLog", {
      requestId: a.requestId,
      actor: "human",
      action:
        a.decision === "override_approve"
          ? "Approved exception"
          : "Upheld rejection",
      reasoning: a.note,
    });

    if (a.decision === "override_approve") {
      await ctx.db.patch(a.requestId, { status: "human_approved" });
      // Brief pace before Slack so "Board approved" shows before "Slack sent".
      await ctx.scheduler.runAfter(1500, api.external.fireSlack, {
        requestId: a.requestId,
      });
    } else {
      await ctx.db.patch(a.requestId, { status: "rejected" });
    }
  },
});
