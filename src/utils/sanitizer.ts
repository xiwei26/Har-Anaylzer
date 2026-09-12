import { HAREntry, HARData } from '../types';

const SENSITIVE_PARAM_NAMES = new Set([
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'secret',
  'api_key',
  'apikey',
  'auth',
  'key',
  'password',
  'pass',
  'pwd',
  'session',
  'sessionid',
  'jwt'
]);

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-session-token',
  'x-csrf-token',
  'x-xsrf-token'
]);

/**
 * Sanitizes URLs by masking sensitive query parameters (e.g. token=***)
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const urlObj = new URL(rawUrl);
    let changed = false;
    for (const key of Array.from(urlObj.searchParams.keys())) {
      if (SENSITIVE_PARAM_NAMES.has(key.toLowerCase())) {
        urlObj.searchParams.set(key, '***');
        changed = true;
      }
    }
    return changed ? urlObj.toString() : rawUrl;
  } catch {
    // If invalid URL, use regex fallback
    return rawUrl.replace(/([?&](token|secret|key|password|auth|api_key)=)[^&]+/gi, '$1***');
  }
}

/**
 * Sanitizes HTTP headers by masking credentials
 */
export function sanitizeHeaders(headers: Array<{ name: string; value: string }>): Array<{ name: string; value: string }> {
  return headers.map(h => {
    const lowerName = h.name.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lowerName)) {
      if (lowerName === 'authorization' && h.value.startsWith('Bearer ')) {
        return { name: h.name, value: 'Bearer *******' };
      }
      return { name: h.name, value: '*******' };
    }
    return h;
  });
}

/**
 * Selects an intelligent, prioritized subset of requests for AI analysis:
 * - Prioritizes 4xx/5xx failures
 * - Prioritizes high latency bottlenecks
 * - Prioritizes large payload transfers
 * - Supplements with regular traffic sample
 * All with sanitized URLs and headers.
 */
export function getSanitizedAIContext(entries: HAREntry[], maxEntries = 60) {
  const selectedIndices = new Set<number>();

  // 1. All or top failed requests (status >= 400)
  entries.forEach((e, idx) => {
    if (e.response.status >= 400 && selectedIndices.size < 25) {
      selectedIndices.add(idx);
    }
  });

  // 2. Slowest requests (>1000ms or highest time)
  const sortedByTime = entries
    .map((e, idx) => ({ time: e.time, idx }))
    .sort((a, b) => b.time - a.time);

  for (const item of sortedByTime) {
    if (selectedIndices.size >= 40) break;
    selectedIndices.add(item.idx);
  }

  // 3. Largest payloads
  const sortedBySize = entries
    .map((e, idx) => ({ size: e.response.content.size || 0, idx }))
    .sort((a, b) => b.size - a.size);

  for (const item of sortedBySize) {
    if (selectedIndices.size >= 50) break;
    selectedIndices.add(item.idx);
  }

  // 4. Fill up to maxEntries with sequential sampling
  for (let i = 0; i < entries.length && selectedIndices.size < maxEntries; i++) {
    selectedIndices.add(i);
  }

  return Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .map(idx => {
      const e = entries[idx];
      return {
        url: sanitizeUrl(e.request.url).substring(0, 160),
        method: e.request.method,
        status: e.response.status,
        statusText: e.response.statusText,
        time: Math.round(e.time),
        size: e.response.content.size || 0,
        type: (e.response.content.mimeType || 'unknown').split(';')[0],
        timings: {
          dns: Math.round(e.timings.dns || 0),
          connect: Math.round(e.timings.connect || 0),
          ttfb: Math.round(e.timings.wait || 0),
          download: Math.round(e.timings.receive || 0)
        }
      };
    });
}
