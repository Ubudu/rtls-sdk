import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '../generated/schema';
import { createError, NetworkError, TimeoutError, RtlsError } from '../errors';

export interface RtlsClientOptions {
  baseUrl?: string;
  apiKey?: string;
  accessToken?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class BaseClient {
  protected readonly client: Client<paths>;
  protected readonly options: Required<Pick<RtlsClientOptions, 'baseUrl' | 'timeoutMs'>> &
    RtlsClientOptions;

  constructor(options: RtlsClientOptions = {}) {
    this.options = {
      baseUrl: 'https://rtls.ubudu.com/api',
      timeoutMs: 30000,
      ...options,
    };

    this.client = createClient<paths>({
      baseUrl: this.options.baseUrl,
      fetch: this.options.fetch,
      headers: this.buildHeaders(),
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers,
    };

    if (this.options.apiKey) {
      headers['X-API-Key'] = this.options.apiKey;
    }

    if (this.options.accessToken) {
      headers['Authorization'] = `Bearer ${this.options.accessToken}`;
    }

    return headers;
  }

  protected createTimeoutSignal(timeoutMs?: number): AbortSignal {
    const timeout = timeoutMs ?? this.options.timeoutMs;
    return AbortSignal.timeout(timeout);
  }

  protected mergeSignals(userSignal?: AbortSignal, timeoutMs?: number): AbortSignal {
    const timeoutSignal = this.createTimeoutSignal(timeoutMs);
    if (!userSignal) {
      return timeoutSignal;
    }
    if ('any' in AbortSignal) {
      return (
        AbortSignal as typeof AbortSignal & { any: (signals: AbortSignal[]) => AbortSignal }
      ).any([userSignal, timeoutSignal]);
    }
    return timeoutSignal;
  }

  protected async handleResponse<T>(response: {
    data?: T;
    error?: unknown;
    response: Response;
  }): Promise<T> {
    if (response.error !== undefined || !response.response.ok) {
      const status = response.response.status;
      let body = response.error;

      if (body === undefined) {
        try {
          body = await response.response.clone().json();
        } catch {
          try {
            body = await response.response.clone().text();
          } catch {
            body = null;
          }
        }
      }

      throw createError(status, body);
    }

    return response.data as T;
  }

  protected async request<T>(
    executor: (options: {
      signal?: AbortSignal;
      headers?: Record<string, string>;
    }) => Promise<{ data?: T; error?: unknown; response: Response }>,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const signal = this.mergeSignals(requestOptions?.signal, requestOptions?.timeoutMs);

    try {
      const response = await executor({ signal, headers: requestOptions?.headers });
      return this.handleResponse(response);
    } catch (error) {
      if (error instanceof RtlsError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          throw new TimeoutError();
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new NetworkError(error.message, error);
        }
      }

      throw new NetworkError('Unknown error occurred', error as Error);
    }
  }

  get raw(): Client<paths> {
    return this.client;
  }
}
