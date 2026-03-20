export interface HARData {
  log: {
    version: string;
    creator: { name: string; version: string };
    pages?: Array<{
      startedDateTime: string;
      id: string;
      title: string;
      pageTimings: { onContentLoad: number; onLoad: number };
    }>;
    entries: HAREntry[];
  };
}

export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    cookies: any[];
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    cookies: any[];
    content: {
      size: number;
      mimeType: string;
      text?: string;
      encoding?: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: any;
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl?: number;
  };
  serverIPAddress?: string;
  connection?: string;
}

export interface AnalysisResult {
  summary: {
    totalRequests: number;
    failedRequests: number;
    totalSize: number;
    totalTime: number;
    avgResponseTime: number;
  };
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    title: string;
    description: string;
    affectedUrl?: string;
  }>;
  advice: string;
}
