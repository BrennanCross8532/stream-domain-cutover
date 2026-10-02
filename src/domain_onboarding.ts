import { z } from "zod";
import { infrai } from "./infrai.js";

export const domainOnboardingSchema = z.object({
  domain: z.string().min(1),
  spf: z.object({ name: z.string().min(1), content: z.string().min(1) }),
  dkim: z.object({ name: z.string().min(1), content: z.string().min(1) }),
  dmarc: z.object({ name: z.string().min(1), content: z.string().min(1) }),
});

export type DomainOnboarding = z.infer<typeof domainOnboardingSchema>;

export async function onboardSendingDomain(input: DomainOnboarding) {
  const zone = await infrai.dns.domain.add(
    { domain: input.domain },
    `domain:${input.domain}:add`,
  );

  const records = [
    { record_type: "TXT" as const, ...input.spf },
    { record_type: "CNAME" as const, ...input.dkim },
    { record_type: "TXT" as const, ...input.dmarc },
  ];
  await Promise.all(
    records.map((record) =>
      infrai.dns.record.upsert(
        { zone_id: zone.zone_id, ttl: 300, ...record },
        `domain:${input.domain}:${record.record_type}:${record.name}`,
      ),
    ),
  );

  const result = await infrai.email.domain.verify(
    { domain: input.domain },
    `domain:${input.domain}:verify`,
  );
  return { zone_id: zone.zone_id, verification_status: result.verification.status };
}
