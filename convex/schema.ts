import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Six tables. Each maps to a concept in CLAUDE.md §1.3: policies are the org's
// rules, requests are work, evaluations are agent decisions, approvals are
// board decisions, auditLog is the institutional memory, externalActions are
// real-world effects.
export default defineSchema({
  policies: defineTable({
    category: v.string(), // "marketing_campaign"
    limit: v.number(), // 50000
    description: v.string(),
  }).index("by_category", ["category"]),

  requests: defineTable({
    campaign: v.string(),
    amount: v.number(),
    requestedBy: v.string(), // "marketing_agent"
    justification: v.string(),
    // The status union IS the state machine. No free-text status anywhere.
    status: v.union(
      v.literal("pending_finance"),
      v.literal("auto_approved"),
      v.literal("escalated"),
      v.literal("human_approved"),
      v.literal("rejected"),
      v.literal("action_fired"),
    ),
  }),

  evaluations: defineTable({
    requestId: v.id("requests"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    withinPolicy: v.boolean(),
    reasoning: v.string(),
  }).index("by_request", ["requestId"]),

  approvals: defineTable({
    requestId: v.id("requests"),
    humanDecision: v.union(
      v.literal("override_approve"),
      v.literal("uphold_reject"),
    ),
    note: v.string(),
  }).index("by_request", ["requestId"]),

  auditLog: defineTable({
    requestId: v.id("requests"),
    actor: v.string(), // "marketing_agent" | "finance_agent" | "human" | "system"
    action: v.string(),
    reasoning: v.string(),
  }).index("by_request", ["requestId"]),

  externalActions: defineTable({
    requestId: v.id("requests"),
    type: v.string(), // "slack"
    status: v.string(), // "sent" | "failed"
    detail: v.string(),
  }),
});
