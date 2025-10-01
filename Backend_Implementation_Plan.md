# Backend Implementation Plan
## Sports Media Platform - BM25-Powered Architecture

**Last Updated:** October 1, 2025  
**Version:** 1.0

---

## Executive Summary

This document outlines the implementation plan for transforming the Corner League Media platform from a mock-data prototype into a fully functional sports media application powered by BM25 ranking algorithms, DeepSeek AI summaries, and real-time sports data.

### Core Objectives
- Replace all mock data with live, relevant sports content
- Implement intelligent content ranking using BM25 algorithm
- Generate AI-powered team summaries using DeepSeek
- Provide real-time scores with cross-source validation
- Deliver categorized news updates (Injuries, Trades, Roster, General)
- Surface local fan experiences with RSVP functionality

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  (React UI - AISummarySection, RecentUpdates, Experiences) │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│               Application & API Layer                    │
│         (Express Routes + WebSocket Events)              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│           Processing & Analytics Layer                   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Scores Agent │  │  News Agent  │  │ Experience   │  │
│  │ (10-30s)     │  │  (10min)     │  │ Agent (daily)│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                  │                  │          │
│  ┌──────▼──────────────────▼──────────────────▼───────┐ │
│  │        BM25 Indexing & Ranking Engine              │ │
│  │  (Memory-mapped indexes per team/category)         │ │
│  └──────┬──────────────────┬──────────────────┬───────┘ │
│         │                  │                  │          │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐  │
│  │Classification│  │  AI Summary  │  │MinHash Dedupe│  │
│  │ Agent (BM25) │  │(DeepSeek AI) │  │   Service    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Data Ingestion Layer                        │
│  RSS Feeds | HTML Scrapers | APIs | Search Engines      │
└─────────────────────────────────────────────────────────┘
```

---

## Agent Architecture

### 1. Scores Agent

**Purpose:** Provide accurate, real-time game scores with cross-source validation

**Data Sources:**
- BallDontLie API (NBA) - Primary source
- Official league APIs (NBA.com, NFL.com, MLB.com)
- ESPN, CBS Sports (validation sources)

**Cadence:**
- Live games: 10-30 seconds
- Non-live games: Hourly
- Game schedules: Daily

**Implementation Details:**

```typescript
interface IScoreSource {
  fetchLive(teamCode: string): Promise<GameScore>;
  fetchSchedule(teamCode: string, startDate: Date, endDate: Date): Promise<Game[]>;
  fetchBoxScore(gameId: string): Promise<BoxScore>;
}

class BallDontLieAdapter implements IScoreSource {
  // NBA implementation
}

class ValidationService {
  // Cross-source majority voting
  // Freshness checks to prevent stale data
  // Duplicate final detection
}
```

**Data Flow:**
1. Celery Beat triggers score fetch (based on cadence)
2. Adapter fetches from multiple sources
3. ValidationService performs cross-source validation
4. Persist to `games` table in storage
5. Publish WebSocket event for live updates
6. Update cache with appropriate TTL

**SLO Targets:**
- Live updates: <5s p50 latency
- No duplicate final scores
- 99.9% accuracy through validation

---

### 2. News Scraping Agent

**Purpose:** Discover and rank relevant sports news for each team

**Data Sources:**

| Source Type | Examples | Priority | Refresh Rate |
|-------------|----------|----------|--------------|
| RSS Feeds | ESPN RSS, Yahoo Sports, The Athletic | High | 10 minutes |
| Major Outlets | ESPN.com, CBS Sports, Bleacher Report | High | 30 minutes |
| Official Sites | NBA.com teams, NFL.com teams, MLB.com teams | Highest | 30 minutes |
| Search Engines | Google News API | Medium | Hourly |

**Trust Scores:**
- Official team sites: 1.0
- Major sports outlets: 0.9
- RSS feeds: 0.8
- Search results: 0.7

**Pipeline Stages:**

```
Fetch → Parse → Fingerprint → Dedupe → Entity Extract → BM25 Index → Store
```

**Implementation Details:**

```typescript
interface NewsSource {
  id: string;
  name: string;
  type: 'rss' | 'html' | 'api';
  url: string;
  trustScore: number;
  parser: ParserConfig;
  rateLimit: { requestsPerSecond: number };
}

class EthicalCrawler {
  // robots.txt parser
  // Proxy rotation
  // Adaptive rate limiting (1-2 req/sec per domain)
  // User-agent rotation
}

class MinHashDeduplicator {
  // SimHash algorithm for near-duplicate detection
  // Fingerprint storage
  // Similarity threshold: 0.85
}

class BM25Indexer {
  // Per-team indexes: {teamId: PostingList}
  // Per-category indexes: {category: PostingList}
  // Memory-mapped for performance
  // Document scoring with k1=1.5, b=0.75
}
```

**Relevance Filtering:**
- Team name/alias keyword matching
- Player name entity recognition
- Location/city matching
- Minimum relevance threshold: 95%

**Storage Schema:**

```typescript
interface ArticleSnapshot {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  body: string;
  author: string | null;
  publishedAt: Date;
  scrapedAt: Date;
  fingerprint: string; // MinHash
  teamIds: string[];
  entities: {
    players: string[];
    teams: string[];
    locations: string[];
  };
  trustScore: number;
}
```

---

### 3. Content Classification Agent

**Purpose:** Categorize news articles into specific types using multi-corpus BM25

**Categories:**
- `injury` - Injury reports, IL placements, recovery updates
- `roster` - Signings, releases, call-ups, roster moves
- `trade` - Trade rumors, completed trades, draft picks
- `general` - General news, features, analysis

**Multi-Corpus Approach:**

```typescript
interface ClassificationCorpus {
  category: 'injury' | 'roster' | 'trade' | 'general';
  documents: string[]; // 100+ verified examples
  bm25Index: BM25Index;
  precisionThreshold: number; // 0.90 for specific categories
}

class BM25Classifier {
  private corpora: Map<string, ClassificationCorpus>;

  async classify(article: ArticleSnapshot): Promise<Classification> {
    // Run article text as query against each corpus
    const scores = await Promise.all(
      this.corpora.map(corpus => 
        corpus.bm25Index.score(article.body)
      )
    );
    
    // Highest score wins if above threshold
    const winner = this.selectWinner(scores);
    
    if (winner.confidence < winner.corpus.precisionThreshold) {
      return { category: 'general', confidence: winner.confidence };
    }
    
    return { 
      category: winner.corpus.category, 
      confidence: winner.confidence,
      rationale: this.explainClassification(winner)
    };
  }
}
```

**Training Data:**
- Seed each corpus with 100+ hand-verified examples
- Continuous learning from admin corrections
- Precision target: ≥90% for specific categories

**Classification Storage:**

```typescript
interface Classification {
  articleId: string;
  category: 'injury' | 'roster' | 'trade' | 'general';
  confidence: number;
  rationale: string;
  classifiedAt: Date;
  model: 'bm25-multi-corpus-v1';
}
```

---

### 4. AI Summary Bot (DeepSeek)

**Purpose:** Generate concise, accurate team summaries from top-ranked articles and recent scores

**AI Provider:** DeepSeek (cost-effective, high-quality)

**Input Sources:**
1. Top-N articles (freshness + trust weighted)
2. Latest game score and context
3. Recent results (last 5 games)
4. Key statistics/trends

**Summary Requirements:**
- Length: 2-3 sentences
- No hallucinated transactions or player moves
- Source citations required
- Balanced tone (not overly positive/negative)

**Implementation:**

```typescript
interface SummaryContext {
  team: { id: string; name: string };
  latestScore: GameScore | null;
  recentResults: Game[];
  topArticles: {
    article: ArticleSnapshot;
    classification: Classification;
    bm25Score: number;
    freshnessWeight: number;
  }[];
  timeframe: string; // "last 24 hours"
}

class DeepSeekSummaryService {
  async generateSummary(context: SummaryContext): Promise<Summary> {
    const prompt = this.buildPrompt(context);
    
    const response = await this.deepseekClient.complete({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, // Low for consistency
      max_tokens: 150
    });
    
    return {
      text: response.text,
      sources: this.extractSources(context.topArticles),
      generatedAt: new Date(),
      model: 'deepseek-chat',
      context: this.hashContext(context)
    };
  }

  private systemPrompt = `You are a sports journalist writing concise team updates.
Rules:
- Write 2-3 sentences maximum
- Only mention facts from provided sources
- Never invent player transactions or game details
- Cite source IDs for any specific claims
- Use active voice and clear language`;
}
```

**Caching Strategy:**
- Cache TTL: 10 minutes
- Invalidation triggers:
  - Breaking news flag from official sources
  - New game final score
  - High-confidence classification (injury/trade/roster)
- Cache key: `summary:{teamId}:{contextHash}`

**Cost Management:**
- Monitor tokens per request
- Rate limit: 100 summaries/hour per team
- Alert if cost exceeds $X/day

---

### 5. Fan Experience Agent

**Purpose:** Discover and rank local fan experiences (watch parties, bars, meetups)

**Data Sources:**
- Community calendars (ICS feeds)
- Sports bars and venues (HTML scraping)
- Meetup.com, Facebook Events (API)
- Team official fan events (RSS)

**Content Types:**
- Watch parties
- Tailgates
- Sports bars showing games
- Fan meetups
- Virtual watch parties

**Ranking Algorithm:**

```typescript
interface ExperienceScore {
  proximity: number;      // 0-1, closer is better
  quality: number;        // 0-1, based on venue rating
  recency: number;        // 0-1, fresher is better
  attendeeCount: number;  // Social proof
}

function rankExperience(
  experience: Experience,
  userLocation: Location
): number {
  const weights = {
    proximity: 0.4,
    quality: 0.3,
    recency: 0.2,
    attendeeCount: 0.1
  };
  
  return (
    weights.proximity * calculateProximity(experience, userLocation) +
    weights.quality * (experience.venueRating || 0.5) +
    weights.recency * calculateRecency(experience.startTime) +
    weights.attendeeCount * Math.min(experience.attendees / 100, 1)
  );
}
```

**Geographic Filtering:**
- Default radius: 25 miles
- Adjustable by user
- Support for virtual events (no location filter)

---

## Data Schema Extensions

### New Entities

```typescript
// Article snapshots
interface ArticleSnapshot {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  body: string;
  author: string | null;
  publishedAt: Date;
  scrapedAt: Date;
  fingerprint: string;
  teamIds: string[];
  entities: EntityExtraction;
  trustScore: number;
}

// Classifications
interface Classification {
  id: string;
  articleId: string;
  category: 'injury' | 'roster' | 'trade' | 'general';
  confidence: number;
  rationale: string;
  classifiedAt: Date;
  model: string;
}

// BM25 Index Metadata
interface IndexMetadata {
  indexId: string;
  indexType: 'team' | 'category';
  targetId: string; // teamId or category name
  documentCount: number;
  lastUpdated: Date;
  avgDocLength: number;
  vocabulary: Record<string, number>; // term -> df
}

// News Sources Registry
interface NewsSource {
  id: string;
  name: string;
  type: 'rss' | 'html' | 'api';
  url: string;
  trustScore: number;
  parser: ParserConfig;
  rateLimit: RateLimitConfig;
  isActive: boolean;
  lastScrapedAt: Date | null;
  errorCount: number;
}

// Experience Sources
interface ExperienceSource {
  id: string;
  name: string;
  type: 'calendar' | 'venue' | 'api';
  url: string;
  location: Location;
  isActive: boolean;
  lastCheckedAt: Date | null;
}
```

---

## API Endpoints

### Dashboard

```
GET /api/dashboard/:sport/:teamCode
Response: {
  team: { id, name, logo },
  summary: {
    text: string,
    sources: string[],
    generatedAt: Date
  },
  latestScore: GameScore | null,
  recentResults: Game[]
}
```

### Updates (News)

```
GET /api/updates?teamId=:id&category=:cat&limit=:n&sourceType=:type
Response: {
  updates: Array<{
    id: string,
    teamId: string,
    category: string,
    title: string,
    description: string,
    timestamp: Date,
    source: string,
    trustScore: number,
    url: string
  }>,
  total: number
}
```

### Experiences

```
GET /api/experiences?teamId=:id&location=:loc&radius=:r
POST /api/experiences/:id/rsvp
DELETE /api/experiences/:id/rsvp
Response: {
  experiences: Array<{
    id: string,
    type: string,
    title: string,
    description: string,
    location: string,
    startTime: Date,
    attendees: number,
    userHasRsvped: boolean
  }>
}
```

### Admin

```
POST /api/admin/reindex
POST /api/admin/refresh-team/:teamId
GET /api/admin/sources
PATCH /api/admin/sources/:id (toggle active)
```

---

## Background Job Scheduling (Celery Beat)

```python
# celerybeat-schedule.py

CELERYBEAT_SCHEDULE = {
    # Scores Agent
    'fetch-live-scores': {
        'task': 'agents.scores.fetch_live',
        'schedule': timedelta(seconds=10),  # Live games
    },
    'fetch-nonlive-scores': {
        'task': 'agents.scores.fetch_nonlive',
        'schedule': timedelta(hours=1),
    },
    'fetch-schedules': {
        'task': 'agents.scores.fetch_schedules',
        'schedule': crontab(hour=3, minute=0),  # Daily at 3am
    },
    
    # News Agent
    'scrape-rss-feeds': {
        'task': 'agents.news.scrape_rss',
        'schedule': timedelta(minutes=10),
    },
    'scrape-major-outlets': {
        'task': 'agents.news.scrape_html',
        'schedule': timedelta(minutes=30),
    },
    'scrape-official-sites': {
        'task': 'agents.news.scrape_official',
        'schedule': timedelta(minutes=30),
    },
    'search-trending': {
        'task': 'agents.news.search_trending',
        'schedule': timedelta(hours=1),
    },
    
    # Classification Agent
    'classify-articles': {
        'task': 'agents.classification.classify_pending',
        'schedule': timedelta(minutes=5),
    },
    
    # AI Summary Bot
    'generate-summaries': {
        'task': 'agents.summary.generate_all',
        'schedule': timedelta(minutes=10),
    },
    'generate-breaking-summaries': {
        'task': 'agents.summary.generate_breaking',
        'schedule': timedelta(minutes=1),  # Quick response
    },
    
    # Fan Experience Agent
    'discover-experiences': {
        'task': 'agents.experiences.discover',
        'schedule': crontab(hour=6, minute=0),  # Daily at 6am
    },
}
```

---

## Caching Strategy

### Cache Layers

| Data Type | Storage | TTL | Invalidation |
|-----------|---------|-----|--------------|
| Live scores | Redis | 15-30s | Game final |
| Historical scores | Redis | 24h | Never |
| Articles (raw) | Redis | 1h | Source update |
| BM25 indexes | Memory-mapped files | Persistent | New documents |
| Classifications | PostgreSQL/MemStorage | Persistent | Manual correction |
| AI summaries | Redis | 10min | Breaking news, new game |
| Team rankings | Redis | 5min | New articles |

### Cache Keys

```typescript
const CACHE_KEYS = {
  liveScore: (gameId: string) => `score:live:${gameId}`,
  teamSummary: (teamId: string, hash: string) => `summary:${teamId}:${hash}`,
  bm25Ranking: (teamId: string, category: string) => `rank:${teamId}:${category}`,
  articleFingerprint: (url: string) => `fingerprint:${url}`,
};
```

---

## Performance & Scalability

### SLO Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Live score latency | <5s p50 | Time from event to WebSocket push |
| News relevance | ≥95% | Team mention verification |
| Classification precision | ≥90% | Manual audit sample |
| Summary freshness | <10min | Time from breaking news to summary |
| API response time | <200ms p95 | All GET endpoints |
| Scraper politeness | 1-2 req/s per domain | Rate limit enforcement |

### Scaling Considerations

**Horizontal Scaling:**
- Multiple Celery workers per agent type
- Redis cluster for distributed caching
- Load balancer for Express API servers

**Vertical Scaling:**
- Memory-mapped BM25 indexes benefit from RAM
- SSD for fast index access
- Multi-core for parallel article processing

**Optimization Priorities:**
1. BM25 index performance (mmap, compression)
2. Scraper efficiency (parallel fetching)
3. Cache hit rates (warm frequently accessed data)
4. Database query optimization (indexes on teamId, category, timestamp)

---

## Security & Ethics

### Scraping Ethics

1. **Robots.txt Compliance**
   - Parse and respect robots.txt for all domains
   - Honor crawl-delay directives
   - Skip disallowed paths

2. **Rate Limiting**
   - 1-2 requests/second per domain maximum
   - Exponential backoff on errors
   - Respect HTTP 429 responses

3. **User Agent**
   - Identify as legitimate bot
   - Provide contact information
   - Rotate user agents appropriately

4. **Content Attribution**
   - Store source URLs
   - Display source names in UI
   - Link to original articles

### API Security

1. **Authentication**
   - Firebase ID token verification on all protected endpoints
   - User UID validation for mutations
   - Rate limiting per user

2. **Cost Controls**
   - DeepSeek API budget limits
   - Request throttling on expensive operations
   - Alert on unusual usage patterns

3. **Input Validation**
   - Zod schemas for all request bodies
   - SQL injection prevention
   - XSS sanitization on article content

---

## Monitoring & Observability

### Key Metrics

```typescript
interface AgentMetrics {
  scoresAgent: {
    gamesTracked: number;
    liveUpdatesPerMinute: number;
    validationSuccessRate: number;
    duplicateFinalsDetected: number;
  };
  newsAgent: {
    articlesScraped: number;
    duplicatesFiltered: number;
    relevanceRate: number;
    sourceHealthMap: Record<string, 'healthy' | 'degraded' | 'down'>;
  };
  classificationAgent: {
    articlesClassified: number;
    precisionByCategory: Record<string, number>;
    ambiguousArticles: number;
  };
  summaryAgent: {
    summariesGenerated: number;
    cacheHitRate: number;
    avgGenerationTime: number;
    costPerSummary: number;
  };
}
```

### Alerting Rules

- Score validation failures > 5% → page on-call
- News scraper down for > 15min → alert
- Classification precision < 85% → warning
- DeepSeek cost > $100/day → alert
- API p95 latency > 500ms → warning

### Structured Logging

```typescript
interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  agent: string;
  operation: string;
  metadata: Record<string, any>;
  duration?: number;
  error?: Error;
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Set up Celery Beat + Redis infrastructure
- [ ] Extend schema for articles, classifications, indexes
- [ ] Build BM25 indexing module with memory-mapped storage
- [ ] Implement MinHash deduplication service
- [ ] Create environment configuration for all API keys

### Phase 2: Scores Agent (Week 3)
- [ ] Build IScoreSource interface + BallDontLie adapter
- [ ] Implement cross-source validation logic
- [ ] Create Celery tasks for score fetching
- [ ] Add WebSocket event publisher
- [ ] Wire up AISummarySection to real data

### Phase 3: News Agent (Weeks 4-5)
- [ ] Build ethical crawler with robots.txt support
- [ ] Implement RSS feed parser
- [ ] Create HTML parsers for major outlets
- [ ] Integrate Google News API
- [ ] Build article processing pipeline
- [ ] Create BM25 index writer

### Phase 4: Classification (Week 6)
- [ ] Build multi-corpus BM25 classifier
- [ ] Create training datasets for each category
- [ ] Implement classification scoring logic
- [ ] Wire up RecentUpdatesSection

### Phase 5: AI Summaries (Week 7)
- [ ] Integrate DeepSeek API client
- [ ] Build summary generation logic
- [ ] Implement caching with smart invalidation
- [ ] Create cost monitoring

### Phase 6: Fan Experiences (Week 8)
- [ ] Build experience discovery agent
- [ ] Implement geographic ranking
- [ ] Wire up FanExperiencesSection
- [ ] Add RSVP functionality

### Phase 7: Polish & Optimization (Week 9-10)
- [ ] Add admin endpoints
- [ ] Implement comprehensive monitoring
- [ ] Performance optimization
- [ ] End-to-end testing

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scraper IP blocks | High | Proxy rotation, rate limiting |
| DeepSeek API outage | Medium | Cache previous summaries, fallback gracefully |
| BM25 index corruption | High | Regular backups, rebuild capability |
| Source website changes | Medium | Monitoring + quick parser updates |
| Cache invalidation bugs | Medium | Manual refresh endpoints |

### Operational Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| High AI costs | Medium | Budget alerts, rate limiting |
| Storage growth | Low | Regular cleanup of old articles |
| Celery worker crashes | Medium | Health checks, auto-restart |
| False classifications | Low | Manual correction UI, retraining |

---

## Success Metrics

### MVP Success Criteria

1. **Data Quality**
   - ✓ 95%+ news relevance to selected teams
   - ✓ <1% duplicate articles in feed
   - ✓ 90%+ classification precision
   - ✓ Live scores updated within 30s

2. **User Experience**
   - ✓ Dashboard loads in <2s
   - ✓ News feed updates every 10min
   - ✓ Summaries accurately reflect team status
   - ✓ All mock data replaced with real content

3. **System Health**
   - ✓ 99.9% API uptime
   - ✓ Zero scraper ethics violations
   - ✓ AI costs under budget
   - ✓ All agents running on schedule

---

## Appendix A: Environment Variables

```bash
# Core
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# APIs
DEEPSEEK_API_KEY=sk-...
BALLDONTLIE_API_KEY=...
GOOGLE_NEWS_API_KEY=...

# Firebase
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

# Scraping
PROXY_URL=http://...
PROXY_USERNAME=...
PROXY_PASSWORD=...

# Monitoring
SENTRY_DSN=...
LOG_LEVEL=info

# Limits
MAX_DEEPSEEK_COST_PER_DAY=100
MAX_ARTICLES_PER_TEAM=1000
CACHE_DEFAULT_TTL=600
```

---

## Appendix B: BM25 Algorithm Parameters

```typescript
const BM25_PARAMS = {
  // Standard BM25 parameters
  k1: 1.5,    // Term frequency saturation
  b: 0.75,    // Length normalization
  
  // Custom weights for sports content
  titleBoost: 2.0,      // Title terms worth 2x
  recentBoost: 1.5,     // Recent articles boosted
  officialBoost: 1.3,   // Official sources boosted
  
  // Thresholds
  minRelevanceScore: 0.3,  // Minimum BM25 score
  minTeamMentions: 2,      // Team must appear 2+ times
};
```

---

## Appendix C: News Source Registry (Initial Seed)

```json
{
  "sources": [
    {
      "id": "espn-nba-rss",
      "name": "ESPN NBA RSS",
      "type": "rss",
      "url": "https://www.espn.com/espn/rss/nba/news",
      "trustScore": 0.9,
      "sports": ["NBA"]
    },
    {
      "id": "nba-official",
      "name": "NBA.com Official",
      "type": "html",
      "url": "https://www.nba.com/news",
      "trustScore": 1.0,
      "sports": ["NBA"]
    },
    {
      "id": "athletic-nba",
      "name": "The Athletic - NBA",
      "type": "rss",
      "url": "https://theathletic.com/nba/rss/",
      "trustScore": 0.9,
      "sports": ["NBA"]
    }
  ]
}
```

---

**Document End**
