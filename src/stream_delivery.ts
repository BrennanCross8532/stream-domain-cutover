import { createServer } from "node:http";
import { ZodError, z } from "zod";
import { InfraiError } from "./infrai.js";
import { deliverReadyAsset, deliverySchema, type ProcessingState } from "./creator_delivery.js";
import { domainOnboardingSchema, onboardSendingDomain } from "./domain_onboarding.js";

const assets = new Map<string, ProcessingState>();
const ingestSchema = z.object({ asset_id: z.string().min(1) });
const jobSchema = z.object({
  asset_id: z.string().min(1),
  state: z.enum(["processing", "ready", "failed"]),
});

async function body(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(res: import("node:http").ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

export const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/domains/onboard") {
      return json(res, 200, await onboardSendingDomain(domainOnboardingSchema.parse(await body(req))));
    }
    if (req.method === "POST" && req.url === "/assets") {
      const input = ingestSchema.parse(await body(req));
      assets.set(input.asset_id, "ingested");
      return json(res, 202, { asset_id: input.asset_id, state: "ingested" });
    }
    if (req.method === "POST" && req.url === "/processing-jobs") {
      const input = jobSchema.parse(await body(req));
      if (!assets.has(input.asset_id)) return json(res, 404, { error: "asset_not_found" });
      assets.set(input.asset_id, input.state);
      return json(res, 200, input);
    }
    if (req.method === "POST" && req.url === "/creator-deliveries") {
      const input = deliverySchema.parse(await body(req));
      const state = assets.get(input.asset_id);
      if (!state) return json(res, 404, { error: "asset_not_found" });
      return json(res, 200, await deliverReadyAsset(input, state));
    }
    return json(res, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError) return json(res, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(res, status, { error: error.code, message: error.message });
    }
    return json(res, 500, { error: "internal_error" });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`stream delivery service listening on http://localhost:${port}`));
}
