/**
 * BM25 Algorithm Implementation
 * 
 * BM25 (Best Match 25) is a ranking function used for document retrieval.
 * 
 * Formula:
 * score(D,Q) = Σ IDF(qi) * (f(qi,D) * (k1 + 1)) / (f(qi,D) + k1 * (1 - b + b * |D| / avgdl))
 * 
 * Where:
 * - D: document
 * - Q: query
 * - qi: query term
 * - f(qi,D): term frequency of qi in D
 * - |D|: length of document D
 * - avgdl: average document length
 * - k1: controls term frequency saturation (default: 1.5)
 * - b: controls document length normalization (default: 0.75)
 * - IDF(qi): inverse document frequency
 */

import { tokenize, calculateTermFrequencies } from './tokenizer';

export interface BM25Document {
  id: string;
  content: string;
  teamId: string;
  metadata?: Record<string, any>;
}

export interface BM25Query {
  terms: string[];
  teamId?: string;
}

export interface BM25Result {
  documentId: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface BM25IndexStats {
  totalDocuments: number;
  avgDocLength: number;
  vocabularySize: number;
}

/**
 * BM25 Index
 * 
 * In-memory BM25 index with inverted index structure
 */
export class BM25Index {
  private k1: number;
  private b: number;
  
  // Document storage
  private documents: Map<string, BM25Document>;
  
  // Inverted index: term -> (docId -> frequency)
  private invertedIndex: Map<string, Map<string, number>>;
  
  // Document lengths
  private documentLengths: Map<string, number>;
  
  // Index statistics
  private totalDocuments: number;
  private avgDocLength: number;
  private vocabulary: Set<string>;

  constructor(k1: number = 1.5, b: number = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.documents = new Map();
    this.invertedIndex = new Map();
    this.documentLengths = new Map();
    this.totalDocuments = 0;
    this.avgDocLength = 0;
    this.vocabulary = new Set();
  }

  /**
   * Add document to index
   */
  addDocument(doc: BM25Document): void {
    // If document already exists, remove it first
    if (this.documents.has(doc.id)) {
      this.removeDocument(doc.id);
    }

    // Tokenize content
    const tokens = tokenize(doc.content);
    const termFreqs = calculateTermFrequencies(tokens);

    // Update inverted index
    for (const [term, freq] of Array.from(termFreqs.entries())) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
      }
      this.invertedIndex.get(term)!.set(doc.id, freq);
      this.vocabulary.add(term);
    }

    // Store document and length
    this.documents.set(doc.id, doc);
    this.documentLengths.set(doc.id, tokens.length);

    // Update statistics
    this.updateStats();
  }

  /**
   * Remove document from index
   */
  removeDocument(docId: string): void {
    const doc = this.documents.get(docId);
    if (!doc) return;

    // Get all terms in document
    const tokens = tokenize(doc.content);
    const terms = new Set(tokens);

    // Remove from inverted index
    for (const term of Array.from(terms)) {
      const postings = this.invertedIndex.get(term);
      if (postings) {
        postings.delete(docId);
        
        // Remove term from index if no documents contain it
        if (postings.size === 0) {
          this.invertedIndex.delete(term);
          this.vocabulary.delete(term);
        }
      }
    }

    // Remove document and length
    this.documents.delete(docId);
    this.documentLengths.delete(docId);

    // Update statistics
    this.updateStats();
  }

  /**
   * Search for documents matching query
   */
  search(query: BM25Query, limit: number = 10): BM25Result[] {
    // Tokenize query
    const queryTerms = query.terms.flatMap(term => tokenize(term));
    
    if (queryTerms.length === 0) {
      return [];
    }

    const scores = new Map<string, number>();

    // Calculate BM25 score for each document
    for (const [docId, doc] of Array.from(this.documents.entries())) {
      // Filter by team if specified
      if (query.teamId && doc.teamId !== query.teamId) {
        continue;
      }

      const score = this.calculateBM25Score(docId, queryTerms);
      
      // Only include documents with non-zero scores
      if (score > 0) {
        scores.set(docId, score);
      }
    }

    // Sort by score and return top results
    const results = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docId, score]) => ({
        documentId: docId,
        score,
        metadata: this.documents.get(docId)?.metadata,
      }));

    return results;
  }

  /**
   * Calculate BM25 score for a document given query terms
   */
  private calculateBM25Score(docId: string, queryTerms: string[]): number {
    let score = 0;
    const docLength = this.documentLengths.get(docId) || 0;
    const avgDocLength = this.avgDocLength || 1; // Avoid division by zero

    // Process each unique query term
    const uniqueTerms = new Set(queryTerms);
    
    for (const term of Array.from(uniqueTerms)) {
      const postings = this.invertedIndex.get(term);
      if (!postings || !postings.has(docId)) continue;

      // Term frequency in document
      const termFreq = postings.get(docId)!;
      
      // Document frequency (number of documents containing term)
      const docFreq = postings.size;

      // Calculate IDF (Inverse Document Frequency)
      // Using BM25 IDF formula with smoothing
      const idf = Math.log(
        (this.totalDocuments - docFreq + 0.5) / (docFreq + 0.5) + 1
      );

      // Calculate TF component with length normalization
      const lengthNorm = 1 - this.b + this.b * (docLength / avgDocLength);
      const tf = (termFreq * (this.k1 + 1)) / (termFreq + this.k1 * lengthNorm);

      // Add to total score
      score += idf * tf;
    }

    return score;
  }

  /**
   * Update index statistics
   */
  private updateStats(): void {
    this.totalDocuments = this.documents.size;

    if (this.totalDocuments === 0) {
      this.avgDocLength = 0;
    } else {
      const totalLength = Array.from(this.documentLengths.values()).reduce(
        (sum, len) => sum + len,
        0
      );
      this.avgDocLength = totalLength / this.totalDocuments;
    }
  }

  /**
   * Get index statistics
   */
  getStats(): BM25IndexStats {
    return {
      totalDocuments: this.totalDocuments,
      avgDocLength: this.avgDocLength,
      vocabularySize: this.vocabulary.size,
    };
  }

  /**
   * Get document by ID
   */
  getDocument(docId: string): BM25Document | undefined {
    return this.documents.get(docId);
  }

  /**
   * Check if document exists
   */
  hasDocument(docId: string): boolean {
    return this.documents.has(docId);
  }

  /**
   * Get all document IDs
   */
  getDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Get term document frequency
   */
  getTermDocFreq(term: string): number {
    const postings = this.invertedIndex.get(term);
    return postings ? postings.size : 0;
  }

  /**
   * Clear entire index
   */
  clear(): void {
    this.documents.clear();
    this.invertedIndex.clear();
    this.documentLengths.clear();
    this.vocabulary.clear();
    this.totalDocuments = 0;
    this.avgDocLength = 0;
  }

  /**
   * Get index size (number of documents)
   */
  size(): number {
    return this.totalDocuments;
  }

  /**
   * Export index state for serialization
   */
  export(): {
    k1: number;
    b: number;
    documents: [string, BM25Document][];
    documentLengths: [string, number][];
  } {
    return {
      k1: this.k1,
      b: this.b,
      documents: Array.from(this.documents.entries()),
      documentLengths: Array.from(this.documentLengths.entries()),
    };
  }

  /**
   * Import index state from serialization
   */
  import(state: {
    k1: number;
    b: number;
    documents: [string, BM25Document][];
    documentLengths: [string, number][];
  }): void {
    this.clear();
    this.k1 = state.k1;
    this.b = state.b;

    // Rebuild index from documents
    for (const [docId, doc] of state.documents) {
      this.addDocument(doc);
    }
  }
}
