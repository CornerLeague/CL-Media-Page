/**
 * HTML Parser Utilities
 * 
 * Helper functions for parsing HTML content using Cheerio.
 * Provides safe extraction methods with error handling.
 */

import * as cheerio from 'cheerio';

export interface ParsedGame {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  period?: string;
  timeRemaining?: string;
}

export class HTMLParser {
  /**
   * Load HTML into a Cheerio instance for parsing
   * @param html The HTML string to parse
   * @returns Cheerio API instance
   */
  static load(html: string): cheerio.CheerioAPI {
    return cheerio.load(html);
  }

  /**
   * Extract text content from an element
   * @param $elem Cheerio element
   * @returns Trimmed text content
   */
  static extractText($elem: cheerio.Cheerio<any>): string {
    return $elem.text().trim();
  }

  /**
   * Extract a number from an element's text content
   * Removes all non-numeric characters and parses as integer
   * @param $elem Cheerio element
   * @returns Parsed number, or 0 if parsing fails
   */
  static extractNumber($elem: cheerio.Cheerio<any>): number {
    const text = this.extractText($elem);
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Extract an attribute value from an element
   * @param $elem Cheerio element
   * @param attr Attribute name
   * @returns Attribute value or undefined if not found
   */
  static extractAttribute($elem: cheerio.Cheerio<any>, attr: string): string | undefined {
    return $elem.attr(attr);
  }

  /**
   * Safely find elements with a selector, returning empty if selector fails
   * @param $ Cheerio API instance
   * @param selector CSS selector
   * @returns Cheerio element(s) or empty set if selector fails
   */
  static safeFind($: cheerio.CheerioAPI, selector: string): cheerio.Cheerio<any> {
    try {
      return $(selector);
    } catch (err) {
      console.warn(`Selector failed: ${selector}`, err);
      return cheerio.load('')('');
    }
  }

  /**
   * Extract multiple text values from elements matching a selector
   * @param $ Cheerio API instance
   * @param selector CSS selector
   * @returns Array of text values
   */
  static extractTextArray($: cheerio.CheerioAPI, selector: string): string[] {
    const results: string[] = [];
    $(selector).each((i, elem) => {
      results.push($(elem).text().trim());
    });
    return results;
  }

  /**
   * Check if an element exists and has content
   * @param $elem Cheerio element
   * @returns true if element exists and has text content
   */
  static hasContent($elem: cheerio.Cheerio<any>): boolean {
    return $elem.length > 0 && this.extractText($elem).length > 0;
  }

  /**
   * Extract a floating point number from text
   * @param $elem Cheerio element
   * @returns Parsed float, or 0 if parsing fails
   */
  static extractFloat($elem: cheerio.Cheerio<any>): number {
    const text = this.extractText($elem);
    const num = parseFloat(text.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  }

  /**
   * Extract href from a link element
   * @param $elem Cheerio element (should be <a> tag)
   * @returns href value or undefined
   */
  static extractLink($elem: cheerio.Cheerio<any>): string | undefined {
    return this.extractAttribute($elem, 'href');
  }

  /**
   * Clean and normalize text (remove extra whitespace, newlines)
   * @param text Input text
   * @returns Cleaned text
   */
  static cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .replace(/\n/g, '')    // Remove newlines
      .trim();
  }
}
