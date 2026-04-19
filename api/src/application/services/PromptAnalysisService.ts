import { UrlContentFetcher, UrlFetchConfig, UrlFetchResult } from '../../shared/utils/UrlContentFetcher';

export class PromptAnalysisService {
  private urlFetcher: UrlContentFetcher;

  constructor(config: UrlFetchConfig) {
    this.urlFetcher = new UrlContentFetcher(config);
  }

  /**
   * Resolve URL content from a prompt.
   * Extracts URLs, detects SPAs via heuristic, fetches SPA content via Jina Reader.
   * Non-SPA URLs are left for the AI's native web_fetch/urlContext tools.
   */
  async resolveUrlContents(prompt: string): Promise<UrlFetchResult[]> {
    const urls = this.urlFetcher.extractUrls(prompt);

    if (urls.length === 0) {
      return [];
    }

    console.log(`[PromptAnalysisService] Found ${urls.length} URL(s) in prompt: ${urls.join(', ')}`);
    const results = await this.urlFetcher.fetchAll(urls);

    const spaResults = results.filter(r => r.isSpa);
    const fetchedCount = spaResults.filter(r => r.content !== null).length;
    const failedCount = spaResults.filter(r => r.content === null).length;

    if (spaResults.length > 0) {
      console.log(`[PromptAnalysisService] SPA URLs: ${spaResults.length}, fetched: ${fetchedCount}, failed: ${failedCount}`);
    }

    for (const result of results) {
      if (result.error) {
        console.warn(`[PromptAnalysisService] URL fetch error for ${result.url}: ${result.error}`);
      } else if (result.content) {
        console.log(`[PromptAnalysisService] Fetched SPA content: ${result.url} (${result.content.length} chars, ${result.fetchTimeMs}ms)`);
      }
    }

    return results;
  }
}
