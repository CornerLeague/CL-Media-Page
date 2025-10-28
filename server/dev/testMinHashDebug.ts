import { MinHash } from '../utils/deduplication/minHash';

const minHash = new MinHash();

console.log('=== MinHash Debug ===\n');

// Test 1
const text1 = 'The Lakers defeated the Celtics in overtime';
const text2 = 'The Lakers beat the Celtics in overtime';
console.log('Text 1:', text1);
console.log('Text 2:', text2);

const sig1 = minHash.signature(text1);
const sig2 = minHash.signature(text2);

console.log('\nSignature 1 sample (first 5 hashes):', sig1.hashes.slice(0, 5));
console.log('Signature 2 sample (first 5 hashes):', sig2.hashes.slice(0, 5));
console.log('All zeros in sig1?', sig1.hashes.every(h => h === 0));
console.log('All zeros in sig2?', sig2.hashes.every(h => h === 0));

const similarity = minHash.similarity(sig1, sig2);
console.log('\nSimilarity:', similarity);

// Test 2 - Word order
console.log('\n--- Test 2 ---');
const text3 = 'quick brown fox jumped over';
const text4 = 'brown fox jumped over quick';
console.log('Text 3:', text3);
console.log('Text 4:', text4);

const sig3 = minHash.signature(text3);
const sig4 = minHash.signature(text4);

console.log('Signature 3 sample:', sig3.hashes.slice(0, 5));
console.log('Signature 4 sample:', sig4.hashes.slice(0, 5));
console.log('All zeros in sig3?', sig3.hashes.every(h => h === 0));
console.log('All zeros in sig4?', sig4.hashes.every(h => h === 0));

const similarity2 = minHash.similarity(sig3, sig4);
console.log('Similarity:', similarity2);

// Test with identical text
console.log('\n--- Test 3 (Identical) ---');
const text5 = 'Same text';
const sig5a = minHash.signature(text5);
const sig5b = minHash.signature(text5);
console.log('Identical similarity:', minHash.similarity(sig5a, sig5b));
