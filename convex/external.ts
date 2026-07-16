import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// The real side effect: one POST to a Slack incoming webhook. Wrapped so the
// workflow completes even if Slack or the venue wifi is down (constraint 6).
export const fireSlack = action({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const req = await ctx.runQuery(api.requests.get, { requestId });
    if (!req) {
      throw new Error("Request not found: " + requestId);
    }
    let status = "sent";
    let detail = "Posted to Slack";
    try {
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error("SLACK_WEBHOOK_URL is not set");
      }
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Budget approved: Rs " + req.amount + " for " + req.campaign,
        }),
      });
      if (!response.ok) {
        throw new Error("Slack returned " + response.status);
      }
    } catch (e) {
      status = "failed";
      detail = "Slack post failed, workflow still completed";
    }
    await ctx.runMutation(api.external.markFired, { requestId, status, detail });
  },
});

// Records the outcome and closes out the workflow. Runs whether the Slack
// post succeeded or failed: the request always reaches its end state.
export const markFired = mutation({
  args: {
    requestId: v.id("requests"),
    status: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("externalActions", {
      requestId: a.requestId,
      type: "slack",
      status: a.status,
      detail: a.detail,
    });
    await ctx.db.patch(a.requestId, { status: "action_fired" });
    await ctx.db.insert("auditLog", {
      requestId: a.requestId,
      actor: "system",
      action: "External action: slack " + a.status,
      reasoning: a.detail,
    });
  },
});
