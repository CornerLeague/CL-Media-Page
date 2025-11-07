/**
 * Seed Articles for Testing
 * 
 * Creates sample data for:
 * - News sources
 * - Articles (multiple teams, categories)
 * - Article classifications
 * - BM25 indexes
 */

import { storage } from '../storage';
import { logger } from '../logger';
import type { InsertArticleClassification } from '@shared/schema';

export async function seedArticles() {
  logger.info('🌱 Seeding articles data...');

  try {
    // Get existing teams
    const teams = await storage.getAllTeams();
    if (teams.length === 0) {
      logger.warn('No teams found. Please seed teams first.');
      return;
    }

    // Use first 4 teams for testing (or all if less than 4)
    const testTeams = teams.slice(0, Math.min(4, teams.length));
    logger.info(`Using ${testTeams.length} teams for seeding`);

    // ===== Seed News Sources =====
    logger.info('Creating news sources...');

    // Idempotent creation: reuse existing by name if present
    const existingEspn = await storage.getNewsSourceByName('ESPN');
    const espnSource = existingEspn ?? await storage.createNewsSource({
      name: 'ESPN',
      domain: 'espn.com',
      sourceType: 'rss',
      rssUrl: 'https://www.espn.com/espn/rss/news',
      totalArticles: 0,
      relevantArticles: 0,
      duplicateArticles: 0,
      isActive: true,
      requestsPerMinute: 10,
    });

    const existingAthletic = await storage.getNewsSourceByName('The Athletic');
    const athleticSource = existingAthletic ?? await storage.createNewsSource({
      name: 'The Athletic',
      domain: 'theathletic.com',
      sourceType: 'scraper',
      baseUrl: 'https://theathletic.com',
      totalArticles: 0,
      relevantArticles: 0,
      duplicateArticles: 0,
      isActive: true,
      requestsPerMinute: 5,
    });

    const existingBleacher = await storage.getNewsSourceByName('Bleacher Report');
    const bleacherSource = existingBleacher ?? await storage.createNewsSource({
      name: 'Bleacher Report',
      domain: 'bleacherreport.com',
      sourceType: 'rss',
      rssUrl: 'https://bleacherreport.com/articles/feed',
      totalArticles: 0,
      relevantArticles: 0,
      duplicateArticles: 0,
      isActive: true,
      requestsPerMinute: 15,
    });

    logger.info(`✓ Created or reused ${3} news sources`);

    // ===== Seed Articles =====
    logger.info('Creating sample articles...');

    type ArticleTemplate = {
      titleTemplate: string;
      contentTemplate: string;
      category: string;
      confidence: number;
      keywords: string[];
    };

    const articleTemplates: ArticleTemplate[] = [
      // Injury articles
      {
        titleTemplate: '{player} out with {injury} injury',
        contentTemplate: '{team} announced today that {player} will miss the next several games due to a {injury} injury. The injury occurred during practice yesterday...',
        category: 'injury',
        confidence: 95,
        keywords: ['injury', 'out', 'miss games'],
      },
      // Trade articles
      {
        titleTemplate: '{team} reportedly interested in {player}',
        contentTemplate: 'According to sources, {team} has shown strong interest in acquiring {player} before the trade deadline. Multiple reports suggest...',
        category: 'trade',
        confidence: 88,
        keywords: ['trade', 'acquire', 'deadline'],
      },
      // Roster articles
      {
        titleTemplate: '{team} signs {player} to contract',
        contentTemplate: '{team} officially announced the signing of {player} to a multi-year contract. The deal is worth...',
        category: 'roster',
        confidence: 92,
        keywords: ['sign', 'contract', 'deal'],
      },
      // General news
      {
        titleTemplate: '{team} prepares for upcoming season',
        contentTemplate: 'As the season approaches, {team} is making final preparations. Coach discussed the team strategy in a recent press conference...',
        category: 'general',
        confidence: 85,
        keywords: ['season', 'preparation', 'strategy'],
      },
    ];

    const players = [
      'LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo',
      'Luka Doncic', 'Joel Embiid', 'Nikola Jokic', 'Jayson Tatum'
    ];

    const injuries = ['knee', 'ankle', 'shoulder', 'hamstring', 'back'];

    let articleCount = 0;
    const sources = [espnSource, athleticSource, bleacherSource];

    // Create 5 articles per team
    for (const team of testTeams) {
      for (let i = 0; i < 5; i++) {
        const template = articleTemplates[i % articleTemplates.length];
        const source = sources[i % sources.length];
        const player = players[Math.floor(Math.random() * players.length)];
        const injury = injuries[Math.floor(Math.random() * injuries.length)];

        // Replace placeholders
        const title = template.titleTemplate
          .replace('{team}', team.name)
          .replace('{player}', player)
          .replace('{injury}', injury);

        const content = template.contentTemplate
          .replace(/{team}/g, team.name)
          .replace(/{player}/g, player)
          .replace(/{injury}/g, injury);

        // Create article
        const daysAgo = Math.floor(Math.random() * 7); // Random date in last 7 days
        const publishedAt = new Date();
        publishedAt.setDate(publishedAt.getDate() - daysAgo);

        const article = await storage.createArticle({
          teamId: team.id,
          title,
          content,
          summary: content.substring(0, 150) + '...',
          author: `${source.name} Staff`,
          publishedAt,
          sourceUrl: `https://${source.domain}/article-${team.id}-${i}-${Date.now()}`,
          sourceName: source.name,
          sourceType: source.sourceType,
          category: template.category,
          confidence: template.confidence,
          relevanceScore: 85 + Math.floor(Math.random() * 15), // 85-100
          isProcessed: true,
          isDeleted: false,
        });

        // Create classification (explicitly typed to satisfy TS)
        const classification: InsertArticleClassification = {
          articleId: article.id,
          category: template.category,
          confidence: template.confidence,
          classifierVersion: 'v1.0-seed',
          reasoning: `Classified as ${template.category} based on content analysis`,
          // Note: omit keywords here to satisfy type constraints in insert schema
        };

        await storage.createArticleClassification(classification);

        articleCount++;
      }

      // Create BM25 index for team
      await storage.createBM25Index({
        teamId: team.id,
        totalDocuments: 5,
        avgDocLength: 150,
        k1: '1.5',
        b: '0.75',
        lastRebuiltAt: new Date(),
        rebuildInProgress: false,
        avgQueryTimeMs: 0,
        totalQueries: 0,
      });

      logger.info(`✓ Created 5 articles for ${team.name}`);
    }

    logger.info(`✓ Created ${articleCount} articles total`);

    // Update source metrics
    await storage.updateNewsSource(espnSource.id, {
      totalArticles: Math.floor(articleCount / 3),
      relevantArticles: Math.floor(articleCount / 3),
    });

    await storage.updateNewsSource(athleticSource.id, {
      totalArticles: Math.floor(articleCount / 3),
      relevantArticles: Math.floor(articleCount / 3),
    });

    await storage.updateNewsSource(bleacherSource.id, {
      totalArticles: Math.floor(articleCount / 3),
      relevantArticles: Math.floor(articleCount / 3),
    });

    logger.info('✓ Updated news source metrics');

    // ===== Summary =====
    logger.info('\n✅ Seeding complete!');
    logger.info(`   • ${3} news sources`);
    logger.info(`   • ${articleCount} articles`);
    logger.info(`   • ${articleCount} classifications`);
    logger.info(`   • ${testTeams.length} BM25 indexes`);

    return {
      sources: 3,
      articles: articleCount,
      classifications: articleCount,
      indexes: testTeams.length,
    };

  } catch (error) {
    logger.error({ err: error }, 'Failed to seed articles');
    throw error;
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedArticles()
    .then(() => {
      logger.info('Seed script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seed script failed:', error);
      process.exit(1);
    });
}
