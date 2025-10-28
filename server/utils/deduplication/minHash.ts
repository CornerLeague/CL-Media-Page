/**
 * MinHash-based Document Deduplication
 * 
 * Uses MinHash algorithm to efficiently detect near-duplicate documents.
 * MinHash approximates the Jaccard similarity between sets using hash functions.
 * 
 * Algorithm:
 * 1. Generate character shingles (n-grams) from text
 * 2. Compute multiple hash values for each shingle
 * 3. Keep minimum hash value for each hash function
 * 4. Compare signatures to estimate Jaccard similarity
 * 
 * Use case: Detect duplicate articles from different sources
 */

export interface MinHashSignature {
  hashes: number[];
  shingleSize: number;
  numHashes: number;
}

export class MinHash {
  private readonly shingleSize: number;
  private readonly numHashes: number;
  private readonly seed: number;

  /**
   * @param shingleSize - Size of character n-grams (default: 3)
   * @param numHashes - Number of hash functions (default: 128)
   */
  constructor(shingleSize: number = 3, numHashes: number = 128) {
    this.shingleSize = shingleSize;
    this.numHashes = numHashes;
    this.seed = 42; // Fixed seed for reproducibility
  }

  /**
   * Generate MinHash signature for text
   * 
   * @param text - Input text to generate signature from
   * @returns MinHash signature containing hash values
   */
  signature(text: string): MinHashSignature {
    const shingles = this.generateShingles(text);
    
    // Handle empty text
    if (shingles.size === 0) {
      return {
        hashes: new Array(this.numHashes).fill(0),
        shingleSize: this.shingleSize,
        numHashes: this.numHashes,
      };
    }
    
    const hashes = this.computeMinHashes(shingles);

    return {
      hashes,
      shingleSize: this.shingleSize,
      numHashes: this.numHashes,
    };
  }

  /**
   * Calculate Jaccard similarity between two signatures
   * 
   * Jaccard similarity = |A ∩ B| / |A ∪ B|
   * MinHash approximates this by counting matching hash values
   * 
   * @param sig1 - First signature
   * @param sig2 - Second signature
   * @returns Similarity score between 0 and 1
   */
  similarity(sig1: MinHashSignature, sig2: MinHashSignature): number {
    if (sig1.numHashes !== sig2.numHashes) {
      throw new Error('Signatures must have same number of hashes');
    }

    let matches = 0;
    for (let i = 0; i < sig1.numHashes; i++) {
      if (sig1.hashes[i] === sig2.hashes[i]) {
        matches++;
      }
    }

    return matches / sig1.numHashes;
  }

  /**
   * Check if two documents are duplicates based on similarity threshold
   * 
   * @param sig1 - First signature
   * @param sig2 - Second signature
   * @param threshold - Similarity threshold (default: 0.8)
   * @returns True if similarity >= threshold
   */
  isDuplicate(
    sig1: MinHashSignature,
    sig2: MinHashSignature,
    threshold: number = 0.8
  ): boolean {
    return this.similarity(sig1, sig2) >= threshold;
  }

  /**
   * Generate character shingles (n-grams) from text
   * 
   * Shingles are overlapping substrings of length n
   * Example: "hello" with shingleSize=2 -> ["he", "el", "ll", "lo"]
   * 
   * @param text - Input text
   * @returns Set of unique shingles
   */
  private generateShingles(text: string): Set<string> {
    // Normalize text: lowercase, collapse whitespace
    const normalized = text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const shingles = new Set<string>();

    // Generate overlapping shingles
    for (let i = 0; i <= normalized.length - this.shingleSize; i++) {
      const shingle = normalized.substring(i, i + this.shingleSize);
      shingles.add(shingle);
    }

    return shingles;
  }

  /**
   * Compute min-hash values for a set of shingles
   * 
   * For each hash function, compute hash of all shingles and keep minimum
   * 
   * @param shingles - Set of shingles from document
   * @returns Array of minimum hash values
   */
  private computeMinHashes(shingles: Set<string>): number[] {
    const hashes: number[] = new Array(this.numHashes).fill(Infinity);

    for (const shingle of Array.from(shingles)) {
      for (let i = 0; i < this.numHashes; i++) {
        const hash = this.hash(shingle, i);
        hashes[i] = Math.min(hashes[i], hash);
      }
    }

    return hashes;
  }

  /**
   * Hash function with seed for generating different hash families
   * 
   * Uses simple but effective hash function (djb2-like)
   * 
   * @param value - String to hash
   * @param hashIndex - Index of hash function (acts as additional seed)
   * @returns 32-bit hash value
   */
  private hash(value: string, hashIndex: number): number {
    let hash = this.seed + hashIndex;
    
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }

  /**
   * Serialize signature to JSON string for storage
   * 
   * @param signature - MinHash signature
   * @returns JSON string
   */
  static serialize(signature: MinHashSignature): string {
    return JSON.stringify(signature);
  }

  /**
   * Deserialize signature from JSON string
   * 
   * @param json - JSON string
   * @returns MinHash signature
   */
  static deserialize(json: string): MinHashSignature {
    return JSON.parse(json);
  }
}

// Global singleton instance with default parameters
export const minHash = new MinHash();
