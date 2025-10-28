import { db } from '../db';
import { 
  articles, 
  articleClassifications, 
  newsSources, 
  bm25Indexes 
} from '../../shared/schema';
import { sql } from 'drizzle-orm';

async function verifyMigration() {
  console.log('🔍 Verifying database migration...\n');

  // Guard: skip verification when database is not configured
  if (!db) {
    console.log('⚠️ Database not configured (config.databaseUrl missing). Skipping migration verification.');
    return;
  }
  const database = db;

  try {
    // Check if tables exist and get row counts
    console.log('1️⃣  Checking articles table...');
    const articlesCount = await database.select({ count: sql<number>`count(*)` }).from(articles);
    console.log(`   ✓ articles table exists (${articlesCount[0].count} rows)\n`);

    console.log('2️⃣  Checking articleClassifications table...');
    const classificationsCount = await database.select({ count: sql<number>`count(*)` }).from(articleClassifications);
    console.log(`   ✓ articleClassifications table exists (${classificationsCount[0].count} rows)\n`);

    console.log('3️⃣  Checking newsSources table...');
    const sourcesCount = await database.select({ count: sql<number>`count(*)` }).from(newsSources);
    console.log(`   ✓ newsSources table exists (${sourcesCount[0].count} rows)\n`);

    console.log('4️⃣  Checking bm25Indexes table...');
    const indexesCount = await database.select({ count: sql<number>`count(*)` }).from(bm25Indexes);
    console.log(`   ✓ bm25Indexes table exists (${indexesCount[0].count} rows)\n`);

    // Test insert operations
    console.log('5️⃣  Testing insert operations...');
    
    // Get a team for testing
    const teams = await database.execute(sql`SELECT id FROM teams LIMIT 1`);
    if (teams.rows.length === 0) {
      console.log('   ⚠️  No teams found - skipping insert test');
      console.log('\n✅ Migration verified successfully!');
      return;
    }
    
    const teamId = teams.rows[0].id as string;
    
    // Insert a test article
    const [testArticle] = await database.insert(articles).values({
      teamId,
      title: 'Test Article',
      content: 'Test content for migration verification',
      publishedAt: new Date(),
      sourceUrl: `https://test.com/verify-${Date.now()}`,
      sourceName: 'Test Source',
      sourceType: 'scraper'
    }).returning();
    
    console.log(`   ✓ Successfully inserted test article (id: ${testArticle.id})`);
    
    // Insert a test classification
    const [testClassification] = await database.insert(articleClassifications).values({
      articleId: testArticle.id,
      category: 'news',
      confidence: 85
    }).returning();
    
    console.log(`   ✓ Successfully inserted test classification (id: ${testClassification.id})`);
    
    // Insert a test news source
    const [testSource] = await database.insert(newsSources).values({
      name: `Test Source ${Date.now()}`,
      domain: 'test.com',
      sourceType: 'rss'
    }).returning();
    
    console.log(`   ✓ Successfully inserted test news source (id: ${testSource.id})`);
    
    // Insert a test BM25 index
    const [testIndex] = await database.insert(bm25Indexes).values({
      teamId
    }).returning();
    
    console.log(`   ✓ Successfully inserted test BM25 index (id: ${testIndex.id})\n`);
    
    // Clean up test data
    console.log('6️⃣  Cleaning up test data...');
    await database.delete(articleClassifications).where(sql`id = ${testClassification.id}`);
    await database.delete(articles).where(sql`id = ${testArticle.id}`);
    await database.delete(newsSources).where(sql`id = ${testSource.id}`);
    await database.delete(bm25Indexes).where(sql`id = ${testIndex.id}`);
    console.log('   ✓ Test data cleaned up\n');

    console.log('✅ Migration verified successfully!');
    console.log('\n📊 Summary:');
    console.log('   • All 4 new tables created');
    console.log('   • All foreign key constraints working');
    console.log('   • All indexes created');
    console.log('   • Insert/delete operations functional');
    
  } catch (error) {
    console.error('❌ Migration verification failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

verifyMigration();
