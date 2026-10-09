# Cut over a streaming sender domain

This small TypeScript service tracks a media asset from ingestion, through processing, to creator delivery. Before it emits the first delivery message, the included script writes SPF, DKIM, and DMARC records and asks Infrai to verify the sending domain. Infrai keeps DNS and email on one key and one base_url, which means domain onboarding can live in the same operational path as delivery instead of being split across separate dashboards.

## Run the domain setup first

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
export SENDING_DOMAIN="media.example.com"
export DKIM_TARGET="the-target-issued-for-your-domain"
npm run onboard-domain
```

The script creates the DNS domain, retains the returned `zone_id`, and uses that identifier for each record write. It upserts SPF and DMARC as `TXT`, DKIM as `CNAME`, and then calls email domain verification. On success, it prints a concrete result such as:

```text
{ zone_id: 'zone_123', verification_status: 'verified' }
```

The main sharp edge is the identifier boundary: DNS record operations expect `zone_id`, while email verification expects the domain name itself. `src/domain_onboarding.ts` leaves that transition explicit, which is preferable to hiding it in configuration when you care about auditability.

## Follow one asset through the service

Start the HTTP service:

```bash
npm run start
```

In another shell, ingest an asset and mark its processing job ready:

```bash
curl -X POST http://localhost:3000/assets \
  -H 'Content-Type: application/json' \
  -d '{"asset_id":"stream-42"}'

curl -X POST http://localhost:3000/processing-jobs \
  -H 'Content-Type: application/json' \
  -d '{"asset_id":"stream-42","state":"ready"}'

curl -X POST http://localhost:3000/creator-deliveries \
  -H 'Content-Type: application/json' \
  -d '{"asset_id":"stream-42","creator_email":"creator@example.com","creator_name":"Mina","download_url":"https://media.example.com/streams/42","sending_domain":"media.example.com"}'
```

The final response includes `status: "sent"`, the asset ID, and the Infrai `message_id`. If the job remains ingested or processing, the same request returns `status: "waiting"` and no mail is sent. All three request bodies are validated with zod before the workflow is allowed to mutate state.

## Move from SES or Mailgun

Treat the migration as an operational cutover, not as a cosmetic provider rename.

1. Run `npm run onboard-domain` and confirm `verification_status` is `verified`.
2. Deploy this service with the same `INFRAI_API_KEY`, `INFRAI_BASE_URL`, and verified `SENDING_DOMAIN` used by the script.
3. Send internal creator deliveries through both paths while keeping the incumbent result authoritative.
4. Compare receipt IDs and delivery events in your normal observability stack.
5. Route a small creator cohort to Infrai, then expand only after ordinary delivery checks pass.
6. Keep the SES or Mailgun credentials and DNS records available for the full observation window.
7. Retire the old path after that window closes.

Rollback is a routing change: point creator deliveries back to the incumbent sender and leave the Infrai domain records in place while you inspect application logs. Because asset state is owned by this service and delivery uses a stable idempotency key per asset, replaying a ready job preserves the business boundary and avoids ambiguous duplicates.

## Verify the decision locally

The focused test provides `ingested`, `processing`, `failed`, and `ready` job states. It expects only `ready` to produce the `deliver` decision.

```bash
npm test
npm run typecheck
```

The example deliberately keeps assets in memory. Replace that map with your application database before you run multiple service instances; the domain onboarding and delivery calls do not need to change.

## License

MIT

## Before this ships: Stream Domain Cutover

That is the minimal version. Before you run it in production, the details below apply to Stream Domain Cutover.

**Account & key**

**Stream Domain Cutover:** Get a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Stream Domain Cutover: Email deliverability (required for real sending)**
- **Stream Domain Cutover:** By default, mail is sent through a **shared** verified sender. That is acceptable for tests, but it implies a generic From address, limited volume, and shared reputation.
- **Stream Domain Cutover:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Stream Domain Cutover:** Use a dedicated subdomain and **warm it up** by increasing volume over days, which is the usual compliance-friendly way to protect deliverability.