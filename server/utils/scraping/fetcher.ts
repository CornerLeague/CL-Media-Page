/**
 * Ethical Fetcher for Web Scraping
 * 
 * Combines rate limiting, robots.txt compliance, and retry logic
 * for responsible web scraping.
 */

import { config } from '../../config';
import { globalRateLimiter } from './rateLimiter';
import { globalRobotsChecker } from './robotsChecker';

export interface FetchOptions {
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  bypassRobots?: boolean;
}

export class EthicalFetcher {
  private readonly userAgent: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor() {
    this.userAgent = config.scraperUserAgent || 
      'CornerLeagueMedia/1.0 (+https://cornerleague.com/bot; contact@cornerleague.com)';
    this.timeout = config.scraperTimeoutMs || 10000;
    this.maxRetries = config.scraperMaxRetries || 3;
  }

  /**
   * Fetch a URL ethically with rate limiting and robots.txt compliance
   * @param url The URL to fetch
   * @param options Optional fetch options
   * @returns The HTML content as a string
   */
  async fetch(url: string, options: FetchOptions = {}): Promise<string> {
    const {
      timeout = this.timeout,
      maxRetries = this.maxRetries,
      headers = {},
      bypassRobots = false,
    } = options;

    // Check robots.txt
    if (!bypassRobots) {
      const canFetch = await globalRobotsChecker.canFetch(url);
      if (!canFetch) {
        throw new Error(`Robots.txt disallows fetching: ${url}`);
      }
    }

    // Rate limiting
    const domain = new URL(url).hostname;
    await globalRateLimiter.waitIfNeeded(domain);

    // Fetch with retries
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
            ...headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
      } catch (err: any) {
        const isLastAttempt = attempt === maxRetries;
        
        if (isLastAttempt) {
          throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts: ${err.message}`);
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Attempt ${attempt} failed for ${url}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed to fetch ${url}`);
  }

  /**
   * Fetch multiple URLs concurrently with rate limiting
   * @param urls Array of URLs to fetch
   * @param options Optional fetch options
   * @returns Array of results (HTML string or error)
   */
  async fetchMany(
    urls: string[], 
    options: FetchOptions = {}
  ): Promise<Array<{ url: string; html?: string; error?: string }>> {
    const results: Array<{ url: string; html?: string; error?: string }> = [];

    for (const url of urls) {
      try {
        const html = await this.fetch(url, options);
        results.push({ url, html });
      } catch (err: any) {
        results.push({ url, error: err.message });
      }
    }

    return results;
  }

  /**
   * Get the user agent string being used
   */
  getUserAgent(): string {
    return this.userAgent;
  }
}

/**
 * Global ethical fetcher instance
 * Use this for all web scraping operations
 */
export const ethicalFetcher = new EthicalFetcher();
