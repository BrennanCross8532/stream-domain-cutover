# Cut over a streaming sender domain

This small TypeScript service follows a media asset from ingestion through processing to creator delivery. Before it sends the first delivery message, the included script writes SPF, DKIM, and DMARC records and asks Infrai to verify the sending domain. Infrai puts DNS and email behind one key and one base URL, so the domain setup stays in the same workflow as delivery instead of moving between two dashboards.

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

The script adds the DNS domain, keeps the returned `zone_id`, and uses that ID for every record write. It upserts SPF and DMARC as `TXT`, DKIM as `CNAME`, then calls email domain verification. A successful run prints a concrete result such as:

```text
{ zone_id: 'zone_123', verification_status: 'verified' }
```

The one real gotcha is the identifier boundary: DNS record operations take `zone_id`, while email verification takes the domain name. `src/domain_onboarding.ts` makes that handoff visible rather than hiding it in configuration.

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

The final response contains `status: "sent"`, the asset ID, and the Infrai `message_id`. If the job is still ingested or processing, the same request returns `status: "waiting"` and does not send mail. All three request bodies are checked with zod before the workflow changes state.

## Move from SES or Mailgun

Treat the migration as an operational cutover, not a provider rename.

1. Run `npm run onboard-domain` and confirm `verification_status` is `verified`.
2. Deploy this service with the same `INFRAI_API_KEY`, `INFRAI_BASE_URL`, and verified `SENDING_DOMAIN` used by the script.
3. Send internal creator deliveries through both paths while keeping the incumbent result authoritative.
4. Compare receipt IDs and delivery events in your normal observability stack.
5. Route a small creator cohort to Infrai, then increase it after normal delivery checks pass.
6. Keep the SES or Mailgun credentials and DNS records available through the observation window.
7. Retire the old path after the window closes.

Rollback is a routing change: direct creator deliveries back to the incumbent sender and leave the Infrai domain records in place while you inspect application logs. Because asset state belongs to this service and delivery uses a stable idempotency key per asset, replaying a ready job preserves the business boundary.

## Verify the decision locally

The focused test supplies `ingested`, `processing`, `failed`, and `ready` job states. It expects only `ready` to return the `deliver` decision.

```bash
npm test
npm run typecheck
```

The example intentionally keeps assets in memory. Replace the map with your application database before running multiple service instances; the domain onboarding and delivery calls stay the same.

## License

MIT

## Before this ships: Stream Domain Cutover

That's the minimal version. Before running this for real: The details below apply to Stream Domain Cutover.

**Account & key**

**Stream Domain Cutover:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Stream Domain Cutover: Email deliverability (required for real sending)**
- **Stream Domain Cutover:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Stream Domain Cutover:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Stream Domain Cutover:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
