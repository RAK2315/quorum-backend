import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Rupee formatting with thousands separators, without relying on Intl locale
// data (which is limited in the Convex runtime).
function money(n: number): string {
  return "Rs " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// The real side effect: one POST to a Slack incoming webhook. Wrapped so the
// workflow completes even if Slack or the venue wifi is down (constraint 6).
// The message summarises the whole decision so the Slack channel is a useful
// record on its own: the path taken, the amount versus the limit, and, for a
// board exception, the human's note.
export const fireSlack = action({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const req = await ctx.runQuery(api.requests.get, { requestId });
    if (!req) {
      throw new Error("Request not found: " + requestId);
    }
    const policy = await ctx.runQuery(api.policies.forCategory, {
      category: "marketing_campaign",
    });
    const limit = policy ? policy.limit : 50000;
    const isAuto = req.status === "auto_approved";

    const lines: string[] = [];
    lines.push(
      isAuto
        ? "✅ *Budget approved* — auto-approved within policy"
        : "✅ *Budget approved* — board-approved exception",
    );
    lines.push("*Campaign:* " + req.campaign);
    lines.push(
      "*Amount:* " + money(req.amount) +
      (isAuto
        ? "  (within the " + money(limit) + " policy limit)"
        : "  (exceeds the " + money(limit) + " policy limit)"),
    );
    if (isAuto) {
      lines.push(
        "Approved automatically by the Finance agent. No human review was required.",
      );
    } else {
      lines.push(
        "Escalated by the Finance agent and approved by the human board.",
      );
      const approval = await ctx.runQuery(api.approvals.forRequest, { requestId });
      if (approval && approval.note) {
        lines.push("*Board note:* " + approval.note);
      }
    }
    lines.push("Logged in Quorum with a full audit trail.");
    const messageText = lines.join("\n");

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
        body: JSON.stringify({ text: messageText }),
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
