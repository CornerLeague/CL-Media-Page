# Implementation Task Breakdown
## Sports Media Platform - BM25-Powered Backend

**Project:** Corner League Media Backend Implementation  
**Duration:** 10 weeks  
**Last Updated:** October 1, 2025

---

## Overview

This document breaks down the backend implementation into actionable tasks and subtasks. Each phase builds upon the previous one, ensuring a stable foundation before adding complexity.

**Total Tasks:** 40  
**Total Subtasks:** 180+

---

## Phase 1: Foundation & Infrastructure (Weeks 1-2)

### Task 1: Extend Database Schema
**Priority:** Critical | **Effort:** 3 days

#### Subtasks:
1.1. Add `ArticleSnapshot` table to `shared/schema.ts`
   - Fields: id, sourceId, url, title, body, author, publishedAt, scrapedAt, fingerprint, teamIds, entities, trustScore
   - Create Drizzle schema definition
   - Add indexes on teamIds, fingerprint, publishedAt

1.2. Add `Classification` table to `shared/schema.ts`
   - Fields: id, articleId, category, confidence, rationale, classifiedAt, model
   - Create foreign key to ArticleSnapshot
   - Add indexes on articleId, category

1.3. Add `IndexMetadata` table to `shared/schema.ts`
   - Fields: indexId, indexType, targetId, documentCount, lastUpdated, avgDocLength, vocabulary
   - Add composite index on (indexType, targetId)

1.4. Add `NewsSource` table to `shared/schema.ts`
   - Fields: id, name, type, url, trustScore, parser, rateLimit, isActive, lastScrapedAt, errorCount
   - Add index on isActive

1.5. Add `ExperienceSource` table to `shared/schema.ts`
   - Fields: id, name, type, url, location, isActive, lastCheckedAt
   - Add spatial index on location (if supported)

1.6. Create Drizzle migration files
   - Generate migration for all new tables
   - Test migration up/down

**Acceptance Criteria:**
- All new schemas defined with proper TypeScript types
- Migrations run successfully
- Foreign keys and indexes created

---

### Task 2: Update Storage Interface
**Priority:** Critical | **Effort:** 2 days

#### Subtasks:
2.1. Extend `IStorage` interface in `server/storage.ts`
   - Add article CRUD methods: createArticle, getArticle, getArticlesByTeam, getArticlesByFingerprint
   - Add classification methods: createClassification, getClassificationsByArticle, updateClassification
   - Add index metadata methods: createIndexMetadata, getIndexMetadata, updateIndexMetadata
   - Add news source methods: createNewsSource, getAllNewsSources, updateNewsSource, getActiveNewsSources

2.2. Implement article methods in `MemStorage` class
   - createArticle with duplicate checking via fingerprint
   - getArticlesByTeam with pagination
   - Bulk operations: createArticlesBulk

2.3. Implement classification methods in `MemStorage` class
   - createClassification with validation
   - Query methods with filtering by category/confidence

2.4. Implement index metadata methods in `MemStorage` class
   - Atomic updates for document count
   - Vocabulary merge operations

2.5. Implement news source methods in `MemStorage` class
   - CRUD operations with error count tracking
   - Query by type and active status

**Acceptance Criteria:**
- All interface methods implemented
- Unit tests passing
- Type safety enforced

---

### Task 3: Build BM25 Indexing Module
**Priority:** Critical | **Effort:** 5 days

#### Subtasks:
3.1. Create `server/bm25/` module structure
   - tokenizer.ts - Text tokenization and normalization
   - posting-list.ts - Inverted index data structure
   - scorer.ts - BM25 scoring algorithm
   - index-writer.ts - Document ingestion
   - index-reader.ts - Query and retrieval
   - types.ts - Type definitions

3.2. Implement tokenizer
   - Lowercase normalization
   - Punctuation removal
   - Stop word filtering (configurable)
   - Stemming (Porter stemmer)
   - Term frequency calculation

3.3. Implement posting list with memory-mapped storage
   - File-backed Map for persistence
   - Posting list format: term -> [(docId, tf, positions)]
   - Compression for large indexes
   - Fast lookup operations

3.4. Implement BM25 scorer
   - Calculate IDF (inverse document frequency)
   - Calculate BM25 score with k1=1.5, b=0.75
   - Support custom field boosts (title, recent, official)
   - Batch scoring for efficiency

3.5. Implement index writer
   - Document ingestion pipeline
   - Update posting lists atomically
   - Maintain metadata (doc count, avg length)
   - Support incremental updates

3.6. Implement index reader
   - Query parsing and tokenization
   - Multi-term query support
   - Result ranking and pagination
   - Support filtering by team/category

3.7. Create index manager
   - Per-team index creation
   - Per-category index creation
   - Index rebuilding utilities
   - Memory management

**Acceptance Criteria:**
- BM25 scoring matches reference implementation
- Memory-mapped files persist across restarts
- Query latency <50ms for 10K documents
- Indexes correctly handle incremental updates

---

### Task 4: Implement MinHash Deduplication
**Priority:** High | **Effort:** 2 days

#### Subtasks:
4.1. Create `server/deduplication/` module
   - minhash.ts - MinHash algorithm
   - fingerprint.ts - Document fingerprinting
   - similarity.ts - Similarity calculation

4.2. Implement MinHash algorithm
   - Generate k-shingles from text (k=3)
   - Hash shingles using MurmurHash3
   - Create signature with n=128 hash functions
   - Optimize for performance

4.3. Implement document fingerprinting
   - Extract text content
   - Generate MinHash signature
   - Store as base64 string
   - Handle edge cases (very short docs)

4.4. Implement similarity detection
   - Jaccard similarity estimation
   - Threshold-based matching (>0.85 = duplicate)
   - LSH (Locality Sensitive Hashing) for fast lookup
   - Batch deduplication

4.5. Create deduplication service
   - Check if article is duplicate before ingestion
   - Find similar articles for a given document
   - Remove duplicates from existing corpus
   - Logging and metrics

**Acceptance Criteria:**
- Correctly identifies exact duplicates
- Identifies near-duplicates (>85% similar)
- Processes 1000 docs/second
- False positive rate <1%

---

### Task 5: Set Up Celery Beat Infrastructure
**Priority:** Critical | **Effort:** 3 days

#### Subtasks:
5.1. Install and configure Celery
   - Install celery, redis dependencies
   - Create celery app instance
   - Configure broker (Redis)
   - Configure result backend

5.2. Set up Redis infrastructure
   - Install Redis (or use cloud Redis)
   - Configure connection pooling
   - Set up persistence (AOF or RDB)
   - Configure memory limits

5.3. Create Celery Beat schedule configuration
   - Define beat schedule file
   - Configure timezone
   - Set up task routing
   - Configure worker concurrency

5.4. Create base task classes
   - BaseAgentTask with logging
   - Error handling and retries
   - Task result storage
   - Monitoring hooks

5.5. Set up worker management
   - Create worker start scripts
   - Configure supervisord/systemd
   - Health check endpoints
   - Graceful shutdown handling

5.6. Create development environment setup
   - Docker Compose for local dev
   - Celery worker + beat + Redis
   - Environment variable configuration
   - Log aggregation

**Acceptance Criteria:**
- Celery workers start successfully
- Beat scheduler triggers tasks on schedule
- Tasks can access shared storage
- Monitoring dashboard functional

---

### Task 6: Environment Configuration
**Priority:** Critical | **Effort:** 1 day

#### Subtasks:
6.1. Create `.env.example` template
   - All required API keys
   - Database URLs
   - Redis configuration
   - Feature flags

6.2. Update configuration loading in `server/index.ts`
   - Validate required env vars on startup
   - Type-safe config object
   - Separate dev/staging/prod configs

6.3. Set up secrets management
   - Use Replit Secrets for sensitive keys
   - Document secret naming conventions
   - Create secret rotation procedure

6.4. Create configuration documentation
   - List all environment variables
   - Describe purpose of each
   - Provide example values
   - Security considerations

**Acceptance Criteria:**
- All secrets properly configured
- Application fails fast on missing required config
- Documentation complete

---

## Phase 2: Scores Agent (Week 3)

### Task 7: Build Score Source Interface
**Priority:** Critical | **Effort:** 2 days

#### Subtasks:
7.1. Create `server/agents/scores/` module structure
   - interfaces.ts - Type definitions
   - adapters/ - Source-specific adapters
   - validator.ts - Cross-source validation
   - cache.ts - Score caching

7.2. Define `IScoreSource` interface
   - fetchLive(teamCode: string): Promise<GameScore>
   - fetchSchedule(teamCode, startDate, endDate): Promise<Game[]>
   - fetchBoxScore(gameId): Promise<BoxScore>
   - getTeamMapping(): Promise<Record<string, string>>

7.3. Create base adapter class
   - Common HTTP client setup
   - Rate limiting logic
   - Error handling and retries
   - Response caching

7.4. Define data models
   - GameScore type
   - Game type (with schedule info)
   - BoxScore type (detailed stats)
   - TeamMapping type

**Acceptance Criteria:**
- Interface fully typed
- Base adapter implements common logic
- Easy to add new sources

---

### Task 8: Implement BallDontLie Adapter
**Priority:** Critical | **Effort:** 3 days

#### Subtasks:
8.1. Create BallDontLie API client
   - HTTP client with API key auth
   - Rate limiting (60 req/min)
   - Response parsing
   - Error handling

8.2. Implement team code mapping
   - Map internal team IDs to BallDontLie IDs
   - Handle team name variations
   - Support for all NBA teams

8.3. Implement fetchLive method
   - Query games endpoint with date filter
   - Parse live game data
   - Handle in-progress vs final states
   - Extract scores, period, time remaining

8.4. Implement fetchSchedule method
   - Query with date range
   - Parse schedule data
   - Include opponent, venue, time

8.5. Implement fetchBoxScore method
   - Query game stats endpoint
   - Parse detailed statistics
   - Team and player stats

8.6. Add comprehensive tests
   - Mock API responses
   - Test error handling
   - Test data transformation

**Acceptance Criteria:**
- All methods return correctly typed data
- Rate limiting respected
- Tests passing with >90% coverage

---

### Task 9: Build Cross-Source Validation
**Priority:** High | **Effort:** 2 days

#### Subtasks:
9.1. Create validation service
   - Fetch from multiple sources
   - Compare results
   - Implement majority voting
   - Confidence scoring

9.2. Implement freshness checks
   - Timestamp comparison
   - Staleness detection
   - Source priority weighting

9.3. Implement duplicate final detection
   - Track game state transitions
   - Prevent re-publishing finals
   - Cache game status

9.4. Create validation rules
   - Score delta threshold (flag >30 point differences)
   - Period validation
   - Status consistency checks

9.5. Add validation metrics
   - Track agreement rates
   - Log discrepancies
   - Alert on validation failures

**Acceptance Criteria:**
- Detects incorrect scores
- Prevents duplicate final notifications
- Logs all validation decisions

---

### Task 10: Create Scores Celery Tasks
**Priority:** Critical | **Effort:** 2 days

#### Subtasks:
10.1. Create `fetch_live_scores` task
   - Query all games in progress
   - Fetch from multiple sources
   - Validate and store
   - Publish updates
   - Schedule: every 10-30s

10.2. Create `fetch_nonlive_scores` task
   - Query recent completed games
   - Fetch final scores
   - Update storage
   - Schedule: hourly

10.3. Create `fetch_schedules` task
   - Fetch upcoming games (next 7 days)
   - Store schedule data
   - Update team calendars
   - Schedule: daily at 3am

10.4. Implement task error handling
   - Retry logic with exponential backoff
   - Error notification
   - Fallback to cached data

10.5. Add task monitoring
   - Execution time tracking
   - Success/failure rates
   - Queue length monitoring

**Acceptance Criteria:**
- Tasks run on schedule
- Live scores update within 30s
- Errors handled gracefully
- Metrics collected

---

### Task 11: Implement WebSocket Events
**Priority:** Medium | **Effort:** 2 days

#### Subtasks:
11.1. Set up WebSocket server
   - Integrate with Express
   - Client connection handling
   - Authentication via Firebase token

11.2. Create event publishers
   - scoreUpdate event
   - gameStart event
   - gameFinal event
   - Event payload structure

11.3. Implement room-based broadcasting
   - Subscribe clients to team rooms
   - Subscribe to game rooms
   - Efficient message routing

11.4. Add client reconnection handling
   - Heartbeat/ping-pong
   - Resume on disconnect
   - Missed event catch-up

11.5. Create WebSocket client SDK
   - JavaScript client library
   - Auto-reconnection
   - Type-safe event handlers

**Acceptance Criteria:**
- Clients receive live updates
- <100ms broadcast latency
- Handles 1000+ concurrent connections

---

### Task 12: Wire Up AISummarySection
**Priority:** High | **Effort:** 1 day

#### Subtasks:
12.1. Update `AISummarySection.tsx`
   - Replace mock data with API call
   - Use React Query for data fetching
   - Handle loading states

12.2. Create API endpoint
   - GET /api/dashboard/:sport/:teamCode
   - Fetch from scores storage
   - Format response

12.3. Add WebSocket integration
   - Subscribe to live score updates
   - Update UI in real-time
   - Optimistic updates

12.4. Handle error states
   - No data available
   - API errors
   - Stale data warnings

**Acceptance Criteria:**
- Live scores display correctly
- Real-time updates work
- Graceful error handling

---

## Phase 3: News Scraping Agent (Weeks 4-5)

### Task 13: Build Ethical Web Crawler
**Priority:** Critical | **Effort:** 4 days

#### Subtasks:
13.1. Create `server/agents/news/crawler/` module
   - robots-parser.ts - Robots.txt handling
   - http-client.ts - HTTP requests with proxy
   - rate-limiter.ts - Adaptive rate limiting
   - user-agent.ts - User agent management

13.2. Implement robots.txt parser
   - Fetch and parse robots.txt
   - Cache parse results (1 day)
   - Check URL against rules
   - Honor crawl-delay

13.3. Implement HTTP client with proxy
   - Proxy rotation logic
   - Request headers (User-Agent, Referer)
   - Timeout handling
   - Response validation

13.4. Implement adaptive rate limiter
   - Per-domain rate limits (1-2 req/s default)
   - Exponential backoff on errors
   - Respect HTTP 429 responses
   - Dynamic throttling

13.5. Create user agent manager
   - Identify as legitimate bot
   - Include contact email
   - Version tracking
   - Rotation if needed

13.6. Add crawler ethics enforcement
   - Validate compliance before each request
   - Log all scraping activity
   - Alert on violations
   - Kill switch for emergency stops

**Acceptance Criteria:**
- Never violates robots.txt
- Rate limits enforced
- All requests logged
- Zero complaints from site owners

---

### Task 14: Implement RSS Feed Parser
**Priority:** High | **Effort:** 2 days

#### Subtasks:
14.1. Create RSS parser module
   - XML parsing (feedparser library)
   - Handle RSS 2.0 and Atom formats
   - Extract: title, link, description, pubDate, author

14.2. Create feed registry
   - ESPN RSS feeds (NBA, NFL, MLB)
   - Yahoo Sports feeds
   - The Athletic feeds
   - Team-specific RSS when available

14.3. Implement feed fetcher
   - Fetch feed XML
   - Parse entries
   - Track last fetch timestamp
   - Detect new entries only

14.4. Create feed-to-article converter
   - Map feed fields to ArticleSnapshot
   - Extract team mentions
   - Generate fingerprint
   - Set trust score

14.5. Add feed monitoring
   - Track feed health (uptime)
   - Alert on parsing errors
   - Detect stale feeds (no updates in 24h)

**Acceptance Criteria:**
- Parses all major feed formats
- Only processes new entries
- Correctly extracts article data
- Monitoring dashboard shows feed health

---

### Task 15: Build HTML Parsers for Major Outlets
**Priority:** High | **Effort:** 5 days

#### Subtasks:
15.1. Create parser framework
   - Base parser class
   - Selector-based extraction
   - Error handling
   - Output validation

15.2. Build ESPN parser
   - Article page structure analysis
   - Extract headline, body, author, date
   - Handle video embeds
   - Extract team tags

15.3. Build CBS Sports parser
   - Article page structure
   - Content extraction
   - Handle slideshows
   - Extract metadata

15.4. Build Bleacher Report parser
   - Article structure
   - Extract long-form content
   - Handle image galleries
   - Extract team/player tags

15.5. Create parser registry
   - Map domains to parsers
   - Version tracking
   - Fallback to generic parser

15.6. Implement parser testing suite
   - Snapshot testing with real HTML
   - Regression detection
   - Performance benchmarks

15.7. Add parser monitoring
   - Track extraction success rate
   - Alert on parse failures >5%
   - Auto-disable broken parsers

**Acceptance Criteria:**
- Each parser extracts clean article data
- Success rate >95%
- Handles website updates gracefully
- Tests prevent regressions

---

### Task 16: Implement Official Site Scrapers
**Priority:** High | **Effort:** 3 days

#### Subtasks:
16.1. Build NBA.com team page scraper
   - Team news sections
   - Press releases
   - Injury reports
   - Parse structured data when available

16.2. Build NFL.com scraper (future expansion)
   - Team news
   - Transaction wire
   - Injury reports

16.3. Build MLB.com scraper (future expansion)
   - Team news
   - Transaction updates
   - Injury/roster updates

16.4. Implement official source prioritization
   - Highest trust score (1.0)
   - Priority indexing
   - Breaking news flags

16.5. Add source verification
   - SSL certificate validation
   - Domain ownership checks
   - Anti-spoofing measures

**Acceptance Criteria:**
- Official sources scraped reliably
- Press releases captured
- Trust scoring applied correctly

---

### Task 17: Integrate Google News API
**Priority:** Medium | **Effort:** 2 days

#### Subtasks:
17.1. Set up Google News API client
   - API key configuration
   - Query builder
   - Response parsing
   - Rate limit handling

17.2. Implement trending topic discovery
   - Query: "{team name} news"
   - Date filters (last 24h)
   - Language and region filters
   - Extract article URLs

17.3. Create article fetcher from search results
   - Follow URL to full article
   - Extract content with generic parser
   - Fall back to snippet if extraction fails

17.4. Implement search result ranking
   - Combine with BM25 scores
   - Boost recent results
   - De-duplicate with existing articles

**Acceptance Criteria:**
- Discovers trending topics
- Captures breaking news quickly
- Integrates with article pipeline

---

### Task 18: Create News Source Registry
**Priority:** High | **Effort:** 2 days

#### Subtasks:
18.1. Design source configuration schema
   - Source metadata (name, type, URL)
   - Trust score (0.0 - 1.0)
   - Parser configuration
   - Rate limit settings

18.2. Seed initial source registry
   - ESPN (RSS + HTML)
   - CBS Sports (HTML)
   - Bleacher Report (HTML)
   - The Athletic (RSS)
   - Yahoo Sports (RSS)
   - Official league sites (HTML)

18.3. Create source management API
   - CRUD operations
   - Enable/disable sources
   - Update trust scores
   - View source health

18.4. Implement source health monitoring
   - Track success rates
   - Error count tracking
   - Auto-disable after N failures
   - Re-enable checks

**Acceptance Criteria:**
- All sources configured correctly
- Admin can manage sources
- Unhealthy sources auto-disabled

---

### Task 19: Build News Scraping Pipeline
**Priority:** Critical | **Effort:** 4 days

#### Subtasks:
19.1. Create pipeline orchestrator
   - Fetch stage
   - Parse stage
   - Fingerprint stage
   - Dedupe stage
   - Entity extraction stage
   - Index stage

19.2. Implement fetch stage
   - Select sources to scrape
   - Respect robots.txt
   - Apply rate limiting
   - Handle failures gracefully

19.3. Implement parse stage
   - Route to correct parser
   - Extract article data
   - Validate required fields
   - Clean HTML content

19.4. Implement fingerprint stage
   - Generate MinHash signature
   - Store fingerprint
   - Check for duplicates

19.5. Implement entity extraction stage
   - Extract player names (NER)
   - Extract team names
   - Extract locations
   - Link to canonical entities

19.6. Create pipeline task
   - Celery task wrapper
   - Error handling per stage
   - Rollback on failure
   - Metrics collection

**Acceptance Criteria:**
- Pipeline processes articles end-to-end
- Each stage independently testable
- Handles errors without data loss
- Processes 100+ articles/minute

---

### Task 20: Build Team Relevance Filter
**Priority:** High | **Effort:** 3 days

#### Subtasks:
20.1. Create relevance scoring algorithm
   - Team name exact match: +50 points
   - Team name fuzzy match: +30 points
   - Team alias match: +40 points
   - Player name match: +20 points per player
   - City name match: +15 points
   - Minimum threshold: 50 points (95% precision target)

20.2. Implement keyword heuristics
   - Build team keyword dictionary
   - Player name database
   - Handle name variations (Warriors, GSW, Golden State)
   - Case-insensitive matching

20.3. Implement entity matching
   - Use NER results
   - Validate entity against team roster
   - Boost recent/active players

20.4. Create relevance testing suite
   - Test cases with known positives
   - Test cases with known negatives
   - Measure precision/recall
   - Tune threshold

20.5. Add manual review queue
   - Flag low-confidence articles
   - Admin review interface
   - Learn from corrections

**Acceptance Criteria:**
- Relevance precision ≥95%
- Recall ≥90% (don't miss important news)
- False positives <2%
- Manual review queue manageable

---

### Task 21: Create BM25 Index Writer
**Priority:** Critical | **Effort:** 3 days

#### Subtasks:
21.1. Implement per-team index writer
   - Create separate index for each team
   - Ingest team-relevant articles
   - Update incrementally
   - Maintain metadata

21.2. Implement per-category index writer
   - Create index for each category
   - Ingest classified articles
   - Support multi-category articles

21.3. Create index update strategies
   - Batch updates (every 5 minutes)
   - Real-time updates (breaking news)
   - Rebuild from scratch (admin trigger)

21.4. Implement index compaction
   - Remove old articles (>90 days)
   - Merge posting lists
   - Recalculate IDF scores

21.5. Add index monitoring
   - Index size tracking
   - Update latency
   - Query performance
   - Memory usage

**Acceptance Criteria:**
- Indexes update within 5 minutes
- Query latency <50ms
- Handles 10K+ articles per team
- Memory-efficient storage

---

### Task 22: Create News Scraping Celery Tasks
**Priority:** Critical | **Effort:** 2 days

#### Subtasks:
22.1. Create `scrape_rss_feeds` task
   - Fetch all active RSS feeds
   - Parse new entries
   - Run through pipeline
   - Schedule: every 10 minutes

22.2. Create `scrape_html_sources` task
   - Scrape major outlet homepages
   - Extract article URLs
   - Fetch and parse articles
   - Schedule: every 30 minutes

22.3. Create `scrape_official_sites` task
   - Scrape official team pages
   - Priority processing
   - Flag as breaking news
   - Schedule: every 30 minutes

22.4. Create `search_trending_topics` task
   - Query Google News API
   - Fetch discovered articles
   - Integrate with pipeline
   - Schedule: hourly

22.5. Create `cleanup_old_articles` task
   - Remove articles >90 days old
   - Archive important articles
   - Update indexes
   - Schedule: daily at 2am

**Acceptance Criteria:**
- Tasks run on schedule
- No task conflicts
- Error handling robust
- Monitoring dashboards show activity

---

## Phase 4: Content Classification (Week 6)

### Task 23: Build Multi-Corpus BM25 Classifier
**Priority:** Critical | **Effort:** 4 days

#### Subtasks:
23.1. Create classification module structure
   - classifier.ts - Main classifier
   - corpus-builder.ts - Build training corpora
   - scorer.ts - Classification scoring
   - types.ts - Type definitions

23.2. Design classification corpora
   - Injury corpus (100+ examples)
   - Roster corpus (100+ examples)
   - Trade corpus (100+ examples)
   - General corpus (100+ examples)

23.3. Implement corpus builder
   - Ingest training documents
   - Build BM25 index per corpus
   - Calculate corpus statistics
   - Serialize to disk

23.4. Implement classification scorer
   - Score article against each corpus
   - Apply precision threshold (≥0.90)
   - Handle ambiguous cases → general
   - Generate confidence score

23.5. Implement classification explainer
   - Extract key matching terms
   - Show corpus scores
   - Generate human-readable rationale

23.6. Add classification testing
   - Hold-out test set
   - Measure precision/recall
   - Confusion matrix
   - Error analysis

**Acceptance Criteria:**
- Precision ≥90% for each category
- Recall ≥85% overall
- Ambiguous articles go to general
- Rationale explains decision

---

### Task 24: Create Training Datasets
**Priority:** Critical | **Effort:** 3 days

#### Subtasks:
24.1. Collect injury corpus examples
   - IL placements
   - Injury updates
   - Return from injury
   - Surgery announcements
   - Minimum 100 diverse examples

24.2. Collect roster corpus examples
   - Signings
   - Releases
   - Call-ups/send-downs
   - Contract extensions
   - Minimum 100 examples

24.3. Collect trade corpus examples
   - Trade rumors
   - Completed trades
   - Trade deadline news
   - Draft pick trades
   - Minimum 100 examples

24.4. Collect general corpus examples
   - Game recaps
   - Analysis pieces
   - Feature stories
   - Interviews
   - Minimum 100 examples

24.5. Validate corpus quality
   - Manual review of each example
   - Remove ambiguous cases
   - Ensure diversity
   - Balance corpus sizes

24.6. Create corpus update process
   - Add new examples from admin corrections
   - Periodic retraining
   - Version tracking

**Acceptance Criteria:**
- Each corpus has 100+ quality examples
- Examples diverse and representative
- Admin can add new training data
- Version controlled

---

### Task 25: Implement Classification Logic
**Priority:** High | **Effort:** 2 days

#### Subtasks:
25.1. Create classification pipeline
   - Fetch unclassified articles
   - Run through classifier
   - Store results
   - Update indexes

25.2. Implement precision-focused thresholds
   - Injury: score ≥ 0.90
   - Roster: score ≥ 0.90
   - Trade: score ≥ 0.90
   - General: fallback

25.3. Add trust score weighting
   - Boost official sources
   - Reduce weight of low-trust sources
   - Combine with BM25 scores

25.4. Create classification task
   - Celery task for batch classification
   - Process new articles every 5 min
   - Handle errors gracefully
   - Log classification decisions

25.5. Add reclassification support
   - Admin can override classification
   - Trigger reindex
   - Update training data

**Acceptance Criteria:**
- All articles classified within 10 min
- Precision targets met
- Reclassification works
- Admin interface functional

---

### Task 26: Wire Up RecentUpdatesSection
**Priority:** High | **Effort:** 2 days

#### Subtasks:
26.1. Create GET /api/updates endpoint
   - Query params: teamId, category, limit, sourceType
   - Fetch from BM25 index
   - Apply filters
   - Sort by timestamp + BM25 score

26.2. Update `RecentUpdatesSection.tsx`
   - Replace mock data
   - Add category filter UI
   - Use React Query
   - Handle loading/error states

26.3. Map category names
   - Frontend: "Latest News" → "general"
   - Frontend: "Injuries" → "injury"
   - Frontend: "Trade News" → "trade"
   - Frontend: "Free Agency" → "roster"

26.4. Add source type filter
   - Official sources only
   - Major outlets only
   - All sources

26.5. Implement infinite scroll
   - Load more as user scrolls
   - Pagination support
   - Loading indicators

**Acceptance Criteria:**
- News displays by category
- Filters work correctly
- Real-time updates
- Smooth UX

---

## Phase 5: AI Summary Bot (Week 7)

### Task 27: Integrate DeepSeek API Client
**Priority:** Critical | **Effort:** 3 days

#### Subtasks:
27.1. Install DeepSeek SDK
   - npm install deepseek-sdk
   - Configure API client
   - Set up authentication

27.2. Create DeepSeek service wrapper
   - Request signing
   - Retry logic (exponential backoff)
   - Timeout handling
   - Error classification

27.3. Implement cost monitoring
   - Track tokens per request
   - Daily cost accumulation
   - Alert on budget threshold
   - Cost per summary metrics

27.4. Add request/response logging
   - Log all prompts
   - Log all completions
   - Sanitize sensitive data
   - Debug mode for development

27.5. Create prompt templates
   - System prompt for sports journalism
   - User prompt template with context
   - Few-shot examples
   - Constraint enforcement

27.6. Implement no-hallucination safeguards
   - Structured context with source IDs
   - Explicit instruction: cite sources
   - Post-processing validation
   - Fact-checking against sources

**Acceptance Criteria:**
- API integration working
- Cost monitoring accurate
- No hallucinations in testing
- Prompt quality validated

---

### Task 28: Build Summary Generation Logic
**Priority:** Critical | **Effort:** 4 days

#### Subtasks:
28.1. Create summary context builder
   - Fetch top-N articles (N=5-10)
   - Weight by freshness (recent = higher)
   - Weight by trust score
   - Include latest game score
   - Include recent results

28.2. Implement article selection algorithm
   - BM25 ranking by team
   - Filter by time window (24h default)
   - Diversity across categories
   - De-duplicate similar content

28.3. Create DeepSeek prompt builder
   - Format context as structured data
   - Include source IDs
   - Add constraints (2-3 sentences, cite sources)
   - Add style guide (active voice, clear)

28.4. Implement summary generator
   - Call DeepSeek API
   - Parse response
   - Validate output length
   - Extract source citations

28.5. Create summary validator
   - Check for hallucinated facts
   - Verify all claims have sources
   - Check tone (not overly positive/negative)
   - Flag suspicious summaries for review

28.6. Add summary quality metrics
   - Length distribution
   - Source citation rate
   - User feedback (thumbs up/down)
   - Manual review flags

**Acceptance Criteria:**
- Summaries are 2-3 sentences
- All claims cited
- No hallucinations
- Quality metrics tracked

---

### Task 29: Implement Summary Caching
**Priority:** High | **Effort:** 2 days

#### Subtasks:
29.1. Create caching layer
   - Redis-based cache
   - Key: summary:{teamId}:{contextHash}
   - TTL: 10 minutes
   - Compression for large summaries

29.2. Implement context hashing
   - Hash article IDs + scores
   - Detect content changes
   - Invalidate on hash mismatch

29.3. Create invalidation triggers
   - Breaking news flag (official sources)
   - New game final score
   - High-confidence classification (injury/trade)
   - Manual admin refresh

29.4. Implement stale-while-revalidate
   - Serve cached summary immediately
   - Trigger background refresh if stale
   - Update cache asynchronously

29.5. Add cache monitoring
   - Hit/miss rates
   - Eviction rates
   - Memory usage
   - Invalidation frequency

**Acceptance Criteria:**
- Cache hit rate >70%
- Summaries fresh within 10 min
- Breaking news invalidates immediately
- Memory usage controlled

---

### Task 30: Create Summary Celery Tasks
**Priority:** High | **Effort:** 2 days

#### Subtasks:
30.1. Create `generate_summaries` task
   - Generate for all active teams
   - Skip if cached and fresh
   - Store results
   - Schedule: every 10 minutes

30.2. Create `generate_breaking_summaries` task
   - Monitor for breaking news flags
   - Generate immediately for affected teams
   - Invalidate cache
   - Schedule: every 1 minute

30.3. Add cost controls
   - Max summaries per hour per team
   - Daily budget enforcement
   - Graceful degradation (serve cached)

30.4. Implement monitoring
   - Track generation time
   - Track API costs
   - Track quality metrics
   - Alert on failures

**Acceptance Criteria:**
- Summaries update every 10 min
- Breaking news handled in <2 min
- Costs within budget
- Monitoring comprehensive

---

## Phase 6: Fan Experiences (Week 8)

### Task 31: Build Experience Discovery Agent
**Priority:** Medium | **Effort:** 4 days

#### Subtasks:
31.1. Create experience discovery module
   - parsers/ - Format-specific parsers
   - scrapers/ - Source scrapers
   - normalizer.ts - Data normalization
   - types.ts - Type definitions

31.2. Implement calendar parser (ICS)
   - Parse ICS files
   - Extract events
   - Map to Experience type
   - Handle recurrence rules

31.3. Implement HTML venue scraper
   - Sports bar listings
   - Extract: name, address, phone, hours
   - Watch party schedules
   - Special events

31.4. Implement API integrations
   - Meetup.com API (if available)
   - Facebook Events API
   - Eventbrite API
   - Team official calendars

31.5. Create experience normalizer
   - Standardize data format
   - Geocode addresses
   - Extract team associations
   - Generate fingerprints

31.6. Implement discovery task
   - Fetch from all sources
   - Parse and normalize
   - Deduplicate
   - Store in database
   - Schedule: daily at 6am

**Acceptance Criteria:**
- Multiple source types supported
- Data normalized correctly
- Duplicates removed
- Daily refresh working

---

### Task 32: Implement Geographic Ranking
**Priority:** Medium | **Effort:** 2 days

#### Subtasks:
32.1. Create location service
   - Geocoding (address → lat/lng)
   - Distance calculation (Haversine)
   - Reverse geocoding (lat/lng → address)

32.2. Implement proximity scoring
   - Calculate distance to user
   - Score: 1.0 at 0 miles, 0.0 at 50+ miles
   - Exponential decay function

32.3. Implement quality scoring
   - Venue rating (if available)
   - Historical attendance
   - Verified/official flag
   - User reviews

32.4. Implement recency scoring
   - Upcoming events score higher
   - Past events score 0
   - Events far in future score lower

32.5. Create composite ranking algorithm
   - Weighted combination
   - proximity: 40%, quality: 30%, recency: 20%, attendance: 10%
   - Normalize scores to 0-1

**Acceptance Criteria:**
- Nearby experiences rank higher
- Quality factors included
- Ranking makes sense to users

---

### Task 33: Create Experience Celery Task
**Priority:** Medium | **Effort:** 1 day

#### Subtasks:
33.1. Create `discover_experiences` task
   - Run all discovery sources
   - Normalize and deduplicate
   - Update storage
   - Schedule: daily at 6am

33.2. Add cleanup logic
   - Remove past experiences
   - Archive popular ones
   - Update attendee counts

33.3. Implement error handling
   - Per-source error isolation
   - Retry failed sources
   - Alert on persistent failures

**Acceptance Criteria:**
- Task runs daily
- Experiences updated
- Errors handled

---

### Task 34: Wire Up FanExperiencesSection
**Priority:** Medium | **Effort:** 2 days

#### Subtasks:
34.1. Create GET /api/experiences endpoint
   - Query params: teamId, location, radius, type
   - Fetch and rank experiences
   - Return with attendee counts

34.2. Update `FanExperiencesSection.tsx`
   - Replace mock data
   - Add location filter
   - Show distance to user
   - Display venue details

34.3. Implement RSVP functionality
   - POST /api/experiences/:id/rsvp
   - DELETE /api/experiences/:id/rsvp
   - Update attendee count
   - Show user's RSVPs

34.4. Add user location support
   - Request geolocation permission
   - Use for proximity sorting
   - Fallback to city/zip input

**Acceptance Criteria:**
- Real experiences display
- Location-based sorting works
- RSVP functionality complete
- User-friendly UX

---

## Phase 7: Polish & Production (Weeks 9-10)

### Task 35: Add Admin Endpoints
**Priority:** Medium | **Effort:** 3 days

#### Subtasks:
35.1. Create admin API routes
   - POST /api/admin/reindex
   - POST /api/admin/refresh-team/:teamId
   - GET /api/admin/sources
   - PATCH /api/admin/sources/:id

35.2. Build reindex functionality
   - Rebuild all BM25 indexes
   - Progress tracking
   - Background job

35.3. Build team refresh
   - Force scrape all sources for team
   - Regenerate summary
   - Invalidate caches

35.4. Create source management
   - View all sources
   - Enable/disable sources
   - Update trust scores
   - View health metrics

35.5. Add authentication
   - Admin-only endpoints
   - Firebase custom claims
   - Role checking

**Acceptance Criteria:**
- Admin can trigger rebuilds
- Source management functional
- Secure authentication

---

### Task 36: Implement Comprehensive Monitoring
**Priority:** High | **Effort:** 4 days

#### Subtasks:
36.1. Set up structured logging
   - Winston/Pino logger
   - Log levels (debug, info, warn, error)
   - Contextual metadata
   - Log aggregation (CloudWatch/Datadog)

36.2. Create metrics collection
   - Agent execution times
   - API latency (p50, p95, p99)
   - Cache hit rates
   - Error rates
   - Cost tracking

36.3. Build monitoring dashboards
   - Grafana or similar
   - Real-time metrics
   - Historical trends
   - Agent health overview

36.4. Implement alerting
   - Scores agent failures
   - News scraper downtime
   - Classification precision drops
   - Budget overruns
   - API errors

36.5. Create health check endpoints
   - GET /health - Basic health
   - GET /health/detailed - All subsystems
   - Include in monitoring

36.6. Add SLO tracking
   - Live score latency <5s
   - News relevance ≥95%
   - Classification precision ≥90%
   - Summary freshness <10min
   - API response time <200ms p95

**Acceptance Criteria:**
- All metrics collected
- Dashboards show key metrics
- Alerts fire appropriately
- SLOs tracked

---

### Task 37: Performance Optimization
**Priority:** High | **Effort:** 4 days

#### Subtasks:
37.1. Optimize BM25 indexes
   - Profile query performance
   - Optimize posting list storage
   - Add query caching
   - Benchmark improvements

37.2. Optimize scraper efficiency
   - Parallel fetching
   - Connection pooling
   - Response streaming
   - Memory optimization

37.3. Optimize database queries
   - Add missing indexes
   - Query plan analysis
   - Connection pooling
   - Read replicas (if needed)

37.4. Optimize caching
   - Tune TTLs based on access patterns
   - Implement cache warming
   - Pre-generate popular summaries
   - Cache compression

37.5. Load testing
   - Simulate 1000 concurrent users
   - Stress test each endpoint
   - Identify bottlenecks
   - Fix performance issues

**Acceptance Criteria:**
- All SLO targets met
- System handles expected load
- No memory leaks
- Query times optimized

---

### Task 38: Security Hardening
**Priority:** Critical | **Effort:** 3 days

#### Subtasks:
38.1. Implement rate limiting
   - Per-IP limits
   - Per-user limits
   - Per-endpoint limits
   - Graceful degradation

38.2. Add input validation
   - Zod schemas for all endpoints
   - SQL injection prevention
   - XSS sanitization
   - File upload validation (if applicable)

38.3. Secure API keys
   - Environment variables only
   - No keys in logs
   - Rotation procedure
   - Access auditing

38.4. Implement CORS properly
   - Whitelist frontend domains
   - Credentials handling
   - Preflight requests

38.5. Add security headers
   - Helmet.js
   - CSP (Content Security Policy)
   - HSTS
   - X-Frame-Options

38.6. Security audit
   - Dependency vulnerability scan
   - Penetration testing
   - Code review
   - Fix issues

**Acceptance Criteria:**
- No known vulnerabilities
- Rate limiting effective
- API keys secure
- Security best practices followed

---

### Task 39: Documentation
**Priority:** Medium | **Effort:** 3 days

#### Subtasks:
39.1. Create API documentation
   - OpenAPI/Swagger spec
   - Endpoint descriptions
   - Request/response examples
   - Error codes

39.2. Create deployment guide
   - Environment setup
   - Database migration
   - Celery worker setup
   - Monitoring setup

39.3. Create operations runbook
   - Common issues and solutions
   - Restart procedures
   - Scaling guidelines
   - Backup/restore

39.4. Create developer guide
   - Code structure overview
   - Adding new agents
   - Adding new sources
   - Testing guidelines

39.5. Update replit.md
   - Current architecture
   - Implementation status
   - Key decisions
   - Future roadmap

**Acceptance Criteria:**
- All documentation complete
- Clear and accurate
- Examples working
- Helpful for new developers

---

### Task 40: End-to-End Testing
**Priority:** Critical | **Effort:** 5 days

#### Subtasks:
40.1. Create test user accounts
   - Various sports/team combinations
   - Different locations
   - Edge cases (no teams, all teams)

40.2. Test complete user journey
   - Sign up
   - Complete onboarding
   - View dashboard with live data
   - Browse news by category
   - RSVP to experiences
   - Update settings

40.3. Test data refresh flows
   - Live score updates
   - News article ingestion
   - Summary regeneration
   - Experience discovery

40.4. Test error scenarios
   - API downtime
   - Invalid data
   - Cache failures
   - Database issues

40.5. Load testing
   - 100 concurrent users
   - 1000 concurrent users
   - Peak load scenarios
   - Sustained load

40.6. Cross-browser testing
   - Chrome, Firefox, Safari
   - Mobile browsers
   - Different screen sizes

40.7. Fix all issues
   - Prioritize critical bugs
   - Fix high-priority issues
   - Document known limitations

**Acceptance Criteria:**
- All user journeys work
- No critical bugs
- Performance acceptable
- Ready for launch

---

## Task Dependencies

### Critical Path
1. Foundation (Tasks 1-6) → Scores (Tasks 7-12) → News (Tasks 13-22) → Classification (Tasks 23-26) → AI Summary (Tasks 27-30)

### Parallel Tracks
- Experiences (Tasks 31-34) can be developed in parallel with Classification/Summary
- Admin/Monitoring (Tasks 35-36) can start once core agents are functional
- Polish (Tasks 37-40) happens at the end

---

## Success Metrics by Phase

### Phase 1 Success
- [ ] All schemas defined
- [ ] BM25 module functional
- [ ] Celery infrastructure running
- [ ] Tests passing

### Phase 2 Success
- [ ] Live NBA scores displaying
- [ ] Cross-source validation working
- [ ] WebSocket updates functional
- [ ] AISummarySection showing real data

### Phase 3 Success
- [ ] 10+ news sources active
- [ ] Articles indexed by team
- [ ] Relevance ≥95%
- [ ] Duplicates removed

### Phase 4 Success
- [ ] Classification precision ≥90%
- [ ] All 4 categories working
- [ ] RecentUpdatesSection showing categorized news

### Phase 5 Success
- [ ] DeepSeek summaries generated
- [ ] No hallucinations
- [ ] 10min cache working
- [ ] Costs within budget

### Phase 6 Success
- [ ] Experiences discovered
- [ ] Geographic ranking working
- [ ] RSVP functionality complete
- [ ] FanExperiencesSection functional

### Phase 7 Success
- [ ] All SLOs met
- [ ] Monitoring comprehensive
- [ ] Security hardened
- [ ] Production ready

---

## Estimated Effort Summary

| Phase | Tasks | Subtasks | Estimated Weeks |
|-------|-------|----------|-----------------|
| Phase 1: Foundation | 6 | 35 | 2 weeks |
| Phase 2: Scores Agent | 6 | 28 | 1 week |
| Phase 3: News Agent | 10 | 52 | 2 weeks |
| Phase 4: Classification | 4 | 18 | 1 week |
| Phase 5: AI Summary | 4 | 20 | 1 week |
| Phase 6: Experiences | 4 | 15 | 1 week |
| Phase 7: Polish | 6 | 32 | 2 weeks |
| **Total** | **40** | **200** | **10 weeks** |

---

**Document End**
