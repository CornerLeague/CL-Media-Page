/**
 * Robots.txt Checker for Ethical Web Scraping
 * 
 * Checks robots.txt before scraping to ensure compliance with site rules.
 * Caches robots.txt per domain for efficiency.
 */

import robotsParser from 'robots-parser';

export class RobotsChecker {
  private robots: Map<string, any> = new Map();
  private readonly userAgent: string;

  /**
   * Create a new RobotsChecker
   * @param userAgent The user agent string to identify the bot
   */
  constructor(userAgent: string = 'CornerLeagueBot/1.0') {
    this.userAgent = userAgent;
  }

  /**
   * Check if a URL can be fetched according to robots.txt
   * @param url The URL to check
   * @returns true if allowed, false if disallowed
   */
  async canFetch(url: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const robotsUrl = `${urlObj.protocol}//${domain}/robots.txt`;

      // Fetch and cache robots.txt if not already cached
      if (!this.robots.has(domain)) {
        try {
          const response = await fetch(robotsUrl);
          const robotsTxt = response.ok ? await response.text() : '';
          this.robots.set(domain, robotsParser(robotsUrl, robotsTxt));
        } catch (fetchErr) {
          console.warn(`Could not fetch robots.txt for ${domain}, assuming allowed`);
          // Create a permissive parser if fetch fails
          this.robots.set(domain, robotsParser(robotsUrl, ''));
        }
      }

      const robot = this.robots.get(domain);
      const allowed = robot.isAllowed(url, this.userAgent);
      
      // If isAllowed returns null/undefined, assume allowed
      return allowed ?? true;
    } catch (err) {
      // If we can't check robots.txt, assume allowed (fail open)
      console.warn(`Failed to check robots.txt for ${url}:`, err);
      return true;
    }
  }

  /**
   * Get the crawl delay specified in robots.txt for this user agent
   * @param domain The domain to check
   * @returns Crawl delay in seconds, or null if not specified
   */
  getCrawlDelay(domain: string): number | null {
    const robot = this.robots.get(domain);
    if (!robot) return null;
    
    try {
      return robot.getCrawlDelay(this.userAgent) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Clear cached robots.txt for a domain or all domains
   * @param domain Optional domain to clear, or undefined to clear all
   */
  clearCache(domain?: string): void {
    if (domain) {
      this.robots.delete(domain);
    } else {
      this.robots.clear();
    }
  }

  /**
   * Get the user agent string being used
   */
  getUserAgent(): string {
    return this.userAgent;
  }
}

/**
 * Global robots checker instance
 * Use this for all web scraping operations
 */
export const globalRobotsChecker = new RobotsChecker('CornerLeagueBot/1.0');
