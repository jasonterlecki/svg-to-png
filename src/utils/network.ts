import { setTimeout as delay } from 'node:timers/promises';

export interface RemoteSvgResponse {
  svg: string;
  baseUrl: string;
  contentType?: string;
}

export interface FetchSvgOptions {
  timeoutMs?: number;
}

const DEFAULT_FETCH_TIMEOUT_MS = 15000;

export async function fetchRemoteSvg(
  urlString: string,
  options: FetchSvgOptions = {},
): Promise<RemoteSvgResponse> {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch API is not available in this Node.js runtime.');
  }

  const url = new URL(urlString);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutPromise = delay(timeoutMs).then(() => {
    controller.abort();
  });

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'image/svg+xml, text/xml, text/plain;q=0.8, */*;q=0.1',
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const svg = await response.text();
    const contentType = response.headers.get('content-type') ?? undefined;
    const baseUrl = new URL('.', url).toString();
    return { svg, baseUrl, contentType };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out after ${timeoutMs}ms fetching ${url.href}`);
    }
    throw error;
  } finally {
    controller.abort();
    await timeoutPromise.catch(() => undefined);
  }
}
