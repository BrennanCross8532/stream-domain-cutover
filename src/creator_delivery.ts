import { z } from "zod";
import { infrai } from "./infrai.js";

export const deliverySchema = z.object({
  asset_id: z.string().min(1),
  creator_email: z.string().email(),
  creator_name: z.string().min(1),
  download_url: z.string().url(),
  sending_domain: z.string().min(1),
});

export type DeliveryInput = z.infer<typeof deliverySchema>;
export type ProcessingState = "ingested" | "processing" | "ready" | "failed";

export function deliveryDecision(state: ProcessingState): "deliver" | "wait" {
  return state === "ready" ? "deliver" : "wait";
}

export async function deliverReadyAsset(input: DeliveryInput, state: ProcessingState) {
  if (deliveryDecision(state) === "wait") {
    return { status: "waiting" as const, asset_id: input.asset_id };
  }

  const receipt = await infrai.email.send(
    {
      to: input.creator_email,
      from: `delivery@${input.sending_domain}`,
      subject: `Your stream is ready, ${input.creator_name}`,
      html: `<p>Your processed stream is ready.</p><p><a href="${input.download_url}">Open asset ${input.asset_id}</a></p>`,
    },
    `asset:${input.asset_id}:creator-delivery`,
  );
  return { status: "sent" as const, asset_id: input.asset_id, message_id: receipt.message_id };
}
