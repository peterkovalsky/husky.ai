export interface UrlFetchConfig {
  maxUrls: number;
  timeoutMs: number;
  maxContentLength: number;
  spaThreshold: number;
  jinaApiKey?: string;
}

export interface UrlFetchResult {
  url: string;
  content: string | null;
  isSpa: boolean;
  error?: string;
  fetchTimeMs: number;
}

export class UrlContentFetcher {
  private config: UrlFetchConfig;

  constructor(config: UrlFetchConfig) {
    this.config = config;
  }

  /**
   * Extract http(s) URLs from free text.
   * Returns deduplicated array, limited to maxUrls.
   */
  extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(?:\/[^\s"'<>()]*)?/g;

    const matches = text.match(urlRegex) || [];

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const url of matches) {
      const cleaned = url.replace(/[.,;:!?)]+$/, '');
      if (!seen.has(cleaned)) {
        seen.add(cleaned);
        unique.push(cleaned);
      }
    }

    return unique.slice(0, this.config.maxUrls);
  }

  /**
   * Fetch a URL and determine if it's a SPA.
   * If SPA, fetches rendered content via Jina Reader.
   * If not SPA, returns null content (AI's native tools handle it).
   */
  async fetchAndResolve(url: string): Promise<UrlFetchResult> {
    const startTime = Date.now();

    try {
      // Phase 1: Plain fetch to check if SPA
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HuskyAI/1.0)',
        },
      });

      if (!response.ok) {
        return {
          url,
          content: null,
          isSpa: false,
          error: `HTTP ${response.status}`,
          fetchTimeMs: Date.now() - startTime,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        return {
          url,
          content: null,
          isSpa: false,
          fetchTimeMs: Date.now() - startTime,
        };
      }

      const html = await response.text();
      const visibleText = this.extractVisibleText(html);

      if (visibleText.length >= this.config.spaThreshold) {
        // Not a SPA — AI's native web_fetch/urlContext handles it
        return {
          url,
          content: null,
          isSpa: false,
          fetchTimeMs: Date.now() - startTime,
        };
      }

      // Phase 2: SPA detected — fetch via Jina Reader
      console.log(`[UrlContentFetcher] SPA detected for ${url} (visible text: ${visibleText.length} chars), fetching via Jina Reader`);
      return await this.fetchViaJina(url, startTime);
    } catch (error) {
      return {
        url,
        content: null,
        isSpa: false,
        error: error instanceof Error ? error.message : String(error),
        fetchTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetch all URLs in parallel.
   */
  async fetchAll(urls: string[]): Promise<UrlFetchResult[]> {
    return Promise.all(urls.map(url => this.fetchAndResolve(url)));
  }

  /**
   * Fetch rendered page content via Jina Reader.
   */
  private async fetchViaJina(url: string, startTime: number): Promise<UrlFetchResult> {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const headers: Record<string, string> = {
        'Accept': 'text/markdown',
      };
      if (this.config.jinaApiKey) {
        headers['Authorization'] = `Bearer ${this.config.jinaApiKey}`;
      }

      const response = await fetch(jinaUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        return {
          url,
          content: null,
          isSpa: true,
          error: `Jina Reader returned HTTP ${response.status}`,
          fetchTimeMs: Date.now() - startTime,
        };
      }

      let content = await response.text();

      if (content.length > this.config.maxContentLength) {
        content = content.substring(0, this.config.maxContentLength) + '\n\n[Content truncated...]';
      }

      return {
        url,
        content,
        isSpa: true,
        fetchTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        url,
        content: null,
        isSpa: true,
        error: error instanceof Error ? error.message : String(error),
        fetchTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract visible text from HTML by stripping script, style, head tags and all HTML tags.
   */
  private extractVisibleText(html: string): string {
    let text = html;
    // Remove script, style, head blocks
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<head[\s\S]*?<\/head>/gi, '');
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }
}
