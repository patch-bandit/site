import { z } from "zod";
export { addCampaignTags, applyCampaign, validateCampaign } from "./campaignCore.ts";
export type { Campaign } from "./campaignCore.ts";

const tag = z
  .string()
  .max(100, "Keep each tag under 100 characters")
  .refine((v) => v.length <= 100, "Keep each tag under 100 characters")
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Tags cannot contain control characters")
  .refine((v) => !/[\uD800-\uDFFF]/.test(v.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")), "Tags cannot contain broken characters");

export const campaignSchema = z
  .object({
    source: tag.optional(),
    medium: tag.optional(),
    campaign: tag.optional(),
    content: tag.optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const set = Object.values(c).some((v) => v !== undefined && v.trim() !== "");
    if (!set) return;
    if (!c.source?.trim()) {
      ctx.addIssue({ code: "custom", path: ["source"], message: "Add a source (where the code lives, such as flyer), or clear the other tag fields" });
    }
    if (!c.medium?.trim()) {
      ctx.addIssue({ code: "custom", path: ["medium"], message: "Add a medium (the kind of thing, such as print), or clear the other tag fields" });
    }
  });
