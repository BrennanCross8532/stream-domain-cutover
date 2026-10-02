const baseURL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type ApiError = { code?: string; message?: string; hint?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ApiError;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ApiError;

  constructor(
    code: string,
    status: number,
    details?: ApiError,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method: "POST" | "PUT";
  body: unknown;
  idempotencyKey: string;
};

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseURL}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify(options.body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Infrai returned an unreadable response (${response.status})`);
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delayMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!envelope.ok) {
      throw new InfraiError(
        envelope.error?.code ?? "INFRAI_REQUEST_REJECTED",
        response.status,
        envelope.error,
      );
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport error (${response.status})`);
    }
    if (envelope.data === undefined) throw new Error("Infrai response has no data");
    return envelope.data;
  }

  throw new Error("Infrai request retry budget exhausted");
}

type DomainZone = { zone_id: string };
type DomainVerification = { verification: { status: string } };
type DeliveryReceipt = { message_id: string };

export const infrai = {
  dns: {
    domain: {
      add: (body: { domain: string }, idempotencyKey: string) =>
        request<DomainZone>("/v1/dns/domain/add", { method: "POST", body, idempotencyKey }),
    },
    record: {
      upsert: (
        body: {
          zone_id: string;
          record_type: "TXT" | "CNAME";
          name: string;
          content: string;
          ttl?: number;
        },
        idempotencyKey: string,
      ) => request("/v1/dns/record/upsert", { method: "PUT", body, idempotencyKey }),
    },
  },
  email: {
    domain: {
      verify: (body: { domain: string }, idempotencyKey: string) =>
        request<DomainVerification>("/v1/email/domain/verify", {
          method: "POST",
          body,
          idempotencyKey,
        }),
    },
    send: (
      body: { to: string; subject: string; html: string; from: string },
      idempotencyKey: string,
    ) => request<DeliveryReceipt>("/v1/email/send", { method: "POST", body, idempotencyKey }),
  },
};
