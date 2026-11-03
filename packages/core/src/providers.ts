/** BYOK provider adapter contract. Business logic asks for a capability, never a vendor. */
export type Capability =
  | "llm.text"
  | "image.generate"
  | "video.image_to_video"
  | "video.text_to_video"
  | "audio.tts"
  | "audio.transcribe"
  | "clip.highlights"
  | "publish.youtube";

/** Where an integration actually stands. Never inflate this. */
export type VerificationLevel = "planned" | "mocked" | "tested_locally" | "tested_live";

export interface PricingHint {
  unit: "second" | "image" | "1k_chars" | "1m_tokens" | "credit" | "request";
  cents?: number; // per unit, list price at `checkedAt`; absent when unknown
  checkedAt: string; // ISO date
  note?: string;
}

export interface ModelInfo {
  id: string;
  capability: Capability;
  label: string;
  pricing?: PricingHint;
}

export interface ProviderManifest {
  id: string;
  name: string;
  capabilities: Capability[];
  models: ModelInfo[];
  auth: "api_key" | "oauth2";
  lifecycle: "sync" | "poll" | "webhook" | "poll_or_webhook";
  cancellation: boolean;
  rateLimit?: { requestsPerMinute?: number; concurrentJobs?: number };
  docsUrl: string;
  verification: VerificationLevel;
}

export interface ProviderRequest {
  modelId: string;
  capability: Capability;
  input: Record<string, unknown>;
  idempotencyKey: string;
}

export type ProviderResult =
  | { state: "done"; outputs: { url: string; mime: string }[]; reportedCents?: number }
  | { state: "pending"; externalId: string; pollAfterMs: number }
  | { state: "error"; retryable: boolean; message: string };

/** Credentials are resolved server-side per call and never stored on the adapter. */
export interface ProviderContext {
  credential: string;
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  manifest: ProviderManifest;
  estimateCents(req: ProviderRequest): number | undefined;
  submit(req: ProviderRequest, ctx: ProviderContext): Promise<ProviderResult>;
  poll?(externalId: string, ctx: ProviderContext): Promise<ProviderResult>;
  cancel?(externalId: string, ctx: ProviderContext): Promise<void>;
}

export class ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();

  register(a: ProviderAdapter): void {
    if (this.adapters.has(a.manifest.id)) throw new Error(`provider ${a.manifest.id} already registered`);
    this.adapters.set(a.manifest.id, a);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  /** Providers offering `cap`, the user's preferred one first. `connected` = ids the user has credentials for. */
  candidates(cap: Capability, connected: ReadonlySet<string>, preferred?: string): ProviderAdapter[] {
    const list = [...this.adapters.values()].filter(
      (a) => connected.has(a.manifest.id) && a.manifest.capabilities.includes(cap),
    );
    return list.sort((x, y) => Number(y.manifest.id === preferred) - Number(x.manifest.id === preferred));
  }
}
