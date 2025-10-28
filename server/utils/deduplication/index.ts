/**
 * Deduplication Module
 * 
 * MinHash-based near-duplicate detection for articles
 */

export {
  MinHash,
  minHash,
  type MinHashSignature,
} from './minHash';

export {
  Deduplicator,
  deduplicator,
  type DeduplicationResult,
} from './deduplicator';
