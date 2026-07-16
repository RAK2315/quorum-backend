import { query } from "./_generated/server";
import { v } from "convex/values";

// Policy lookup by category. The Finance agent reads this before deciding.
export const forCategory = query({
  args: { category: v.string() },
  handler: async (ctx, { category }) => {
    return await ctx.db
      .query("policies")
      .withIndex("by_category", (q) => q.eq("category", category))
      .first();
  },
});
