/**
 * 법제처 OPEN API 클라이언트.
 * - fetch + 지수 backoff 재시도 (408/429/5xx + ECONNRESET·ETIMEDOUT·ENOTFOUND·EAI_AGAIN·AbortError)
 * - OC 키 마스킹 (에러·로그·URL)
 * - AbortController 타임아웃
 * - generic API wrapper — display·query 등 도메인 파라미터는 호출자(primitive 도구)가 명시.
 *   짧은 법령명 quirk(법제처 lawSearch가 display=20에서 일부 법령명 후순위) 회피는
 *   각 search 도구가 `extraParams: { display: "100" }` 로 처리.
 */

import { LawApiError, maskApiKey } from "../lib/errors.js";
import { loadEnv } from "../lib/env.js";

const DEFAULT_BASE_URL = "https://www.law.go.kr/DRF";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"]);

export interface FetchApiOptions {
  /** "lawSearch.do" | "lawService.do" | "..."  */
  endpoint: string;
  /** law / admrul / ordin / prec / ppc / pi 등 */
  target: string;
  /** 응답 형식 (기본 XML) */
  type?: "XML" | "JSON" | "HTML";
  /** query · display · page · MST · ID 등 */
  extraParams?: Record<string, string>;
  /** ad-hoc 키 override (없으면 기본 키 사용) */
  apiKey?: string;
  /** 타임아웃 ms (없으면 client 기본값) */
  timeoutMs?: number;
}

export interface LawApiClientOptions {
  /** 기본 API 키 (없으면 process.env.LAW_OC) */
  apiKey?: string;
  /** API 베이스 URL (테스트용 override) */
  baseUrl?: string;
  /** 기본 타임아웃 ms */
  timeoutMs?: number;
  /** 최대 재시도 횟수 */
  maxRetries?: number;
}

export class LawApiClient {
  private readonly defaultApiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: LawApiClientOptions = {}) {
    loadEnv();
    this.defaultApiKey = options.apiKey ?? process.env.LAW_OC ?? "";
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /** 법제처 API 호출. 응답 본문(text)을 그대로 반환. */
  async fetchApi(opts: FetchApiOptions): Promise<string> {
    const apiKey = opts.apiKey ?? this.defaultApiKey;
    if (!apiKey) {
      throw new LawApiError(
        "LAW_OC API key not configured (set in .env or pass apiKey explicitly)"
      );
    }
    const url = this.buildUrl(opts, apiKey);
    return this.fetchWithRetry(url, opts.timeoutMs ?? this.timeoutMs);
  }

  /** URL 조립 (테스트에서 직접 호출 가능하도록 public) */
  buildUrl(opts: FetchApiOptions, apiKey: string): string {
    const params = new URLSearchParams();
    params.set("OC", apiKey);
    params.set("target", opts.target);
    params.set("type", opts.type ?? "XML");
    for (const [k, v] of Object.entries(opts.extraParams ?? {})) {
      params.set(k, v);
    }
    return `${this.baseUrl}/${opts.endpoint}?${params.toString()}`;
  }

  private async fetchWithRetry(url: string, timeoutMs: number): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: "application/xml, text/xml, application/json, text/html",
          },
        });
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        if (attempt < this.maxRetries && isRetryableError(err)) {
          await sleep(backoffMs(attempt));
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new LawApiError(
          `Law API fetch failed: ${maskApiKey(message)} (URL: ${maskApiKey(url)})`,
          undefined,
          err
        );
      }
      clearTimeout(timeoutId);

      if (response.ok) {
        return await response.text();
      }

      if (RETRY_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
        lastError = new LawApiError(`HTTP ${response.status}`, response.status);
        await sleep(backoffMs(attempt));
        continue;
      }

      throw new LawApiError(
        `Law API error: ${response.status} ${response.statusText} (URL: ${maskApiKey(url)})`,
        response.status
      );
    }

    if (lastError instanceof Error) throw lastError;
    throw new LawApiError("Law API: max retries exceeded");
  }
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 5000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  if ("code" in err && typeof (err as { code?: unknown }).code === "string") {
    return RETRYABLE_ERROR_CODES.has((err as { code: string }).code);
  }
  // fetch는 TypeError로 네트워크 에러를 던지는 경우가 있음 (Node 18+)
  if (err.name === "TypeError" && err.message.toLowerCase().includes("fetch")) {
    return true;
  }
  return false;
}
