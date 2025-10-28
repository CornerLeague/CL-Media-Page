/**
 * BM25 Tokenizer
 * 
 * Handles text tokenization and normalization for BM25 indexing.
 * - Lowercasing
 * - Punctuation removal
 * - Stopword filtering
 * - Token length filtering
 */

// Common English stopwords
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
  'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
]);

export interface TokenizerOptions {
  /** Remove stopwords (default: true) */
  removeStopwords?: boolean;
  /** Minimum token length (default: 2) */
  minLength?: number;
  /** Maximum token length (default: 50) */
  maxLength?: number;
  /** Convert to lowercase (default: true) */
  lowercase?: boolean;
}

/**
 * Tokenize and normalize text for BM25 indexing
 */
export function tokenize(
  text: string,
  options: TokenizerOptions = {}
): string[] {
  const {
    removeStopwords = true,
    minLength = 2,
    maxLength = 50,
    lowercase = true,
  } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Convert to lowercase
  let processedText = lowercase ? text.toLowerCase() : text;

  // Remove URLs
  processedText = processedText.replace(/https?:\/\/[^\s]+/g, '');

  // Remove email addresses
  processedText = processedText.replace(/[\w.-]+@[\w.-]+\.\w+/g, '');

  // Replace punctuation and special characters with spaces
  processedText = processedText.replace(/[^\w\s'-]/g, ' ');

  // Handle contractions (don't -> dont, it's -> its)
  processedText = processedText.replace(/'/g, '');

  // Split on whitespace
  let tokens = processedText.split(/\s+/).filter(token => token.length > 0);

  // Apply filters
  tokens = tokens.filter(token => {
    // Length filter
    if (token.length < minLength || token.length > maxLength) {
      return false;
    }

    // Stopword filter
    if (removeStopwords && STOPWORDS.has(token)) {
      return false;
    }

    // Remove tokens that are just numbers
    if (/^\d+$/.test(token)) {
      return false;
    }

    return true;
  });

  return tokens;
}

/**
 * Calculate term frequencies from tokens
 */
export function calculateTermFrequencies(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }
  
  return frequencies;
}

/**
 * Serialize term frequencies to JSON string for storage
 */
export function serializeTermFrequencies(termFreqs: Map<string, number>): string {
  return JSON.stringify(Object.fromEntries(termFreqs));
}

/**
 * Deserialize term frequencies from JSON string
 */
export function deserializeTermFrequencies(json: string): Map<string, number> {
  try {
    const obj = JSON.parse(json);
    return new Map(Object.entries(obj).map(([k, v]) => [k, v as number]));
  } catch {
    return new Map();
  }
}

/**
 * Extract keywords (top N most frequent terms)
 */
export function extractKeywords(
  text: string,
  topN: number = 10
): string[] {
  const tokens = tokenize(text);
  const termFreqs = calculateTermFrequencies(tokens);
  
  return Array.from(termFreqs.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term]) => term);
}

/**
 * Calculate content hash for deduplication
 */
export function calculateContentHash(text: string): string {
  // Normalize text
  const normalized = tokenize(text, { removeStopwords: false })
    .join(' ')
    .trim();
  
  // Simple hash function (FNV-1a)
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  
  return (hash >>> 0).toString(16).padStart(8, '0');
}
