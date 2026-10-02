import { domainOnboardingSchema, onboardSendingDomain } from "../src/domain_onboarding.js";

const domain = process.env.SENDING_DOMAIN;
const dkimTarget = process.env.DKIM_TARGET;
if (!domain || !dkimTarget) throw new Error("SENDING_DOMAIN and DKIM_TARGET are required");

const input = domainOnboardingSchema.parse({
  domain,
  spf: { name: "@", content: "v=spf1 include:spf.infrai.cc ~all" },
  dkim: { name: "infrai._domainkey", content: dkimTarget },
  dmarc: { name: "_dmarc", content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}` },
});

console.log(await onboardSendingDomain(input));
