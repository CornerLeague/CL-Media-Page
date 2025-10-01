# Backend Implementation Plan
## Sports Media Platform - BM25-Powered Architecture

**Last Updated:** October 1, 2025  
**Version:** 1.0

---

## Executive Summary

This document outlines the implementation plan for transforming the Corner League Media platform from a mock-data prototype into a fully functional sports media application powered by BM25 ranking algorithms, DeepSeek AI summaries, and real-time sports data.

### Core Objectives
- Replace all mock data with live, relevant sports content
- **Implement user-based personalization: all data filtered by selected favorite teams**
- **Provide sport overview when no team is selected**
- Implement intelligent content ranking using BM25 algorithm
- Generate AI-powered team summaries using DeepSeek
- Provide real-time scores with cross-source validation
- Deliver categorized news updates (Injuries, Trades, Roster, General)
- Surface local fan experiences with RSVP functionality

### Personalization Architecture
**Team-Based Filtering:** Every data source, agent, and API endpoint filters content based on the user's selected favorite teams. When a user selects a sport + team, all scores, news, summaries, and experiences display **only** for that team.

**Sport Overview Mode:** When a user selects only a sport (no specific team), the system provides a league-wide overview including:
- Top league news and headlines
- Featured games and scores
- League-wide trends and highlights
- No team-specific filtering applied

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│           (React UI + User Context Provider)             │
│    User selects: Sport + Team(s) OR Sport only           │
└────────────────────┬────────────────────────────────────┘
                     │ (userContext: sport, teams[])
┌────────────────────▼────────────────────────────────────┐
│               Application & API Layer                    │
│    (Express Routes + WebSocket + Team Filtering)         │
│         Every endpoint filters by user's teams           │
└────────────────────┬────────────────────────────────────┘
                     │ (teamIds[])
┌────────────────────▼────────────────────────────────────┐
│           Processing & Analytics Layer                   │
│         **ALL AGENTS FILTER BY TEAM IDs**                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Scores Agent │  │  News Agent  │  │ Experience   │  │
│  │ (10-30s)     │  │  (10min)     │  │ Agent (daily)│  │
│  │ Teams: [...]  │  │ Teams: [...]  │  │ Teams: [...] │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                  │                  │          │
│  ┌──────▼──────────────────▼──────────────────▼───────┐ │
│  │        BM25 Indexing & Ranking Engine              │ │
│  │    (Per-team indexes, query filtered by teams)     │ │
│  └──────┬──────────────────┬──────────────────┬───────┘ │
│         │                  │                  │          │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐  │
│  │Classification│  │  AI Summary  │  │MinHash Dedupe│  │
│  │ (per team)   │  │ (per team)   │  │(per team)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ (filtered by teams)
┌────────────────────▼────────────────────────────────────┐
│              Data Ingestion Layer                        │
│   RSS Feeds | HTML Scrapers | APIs | Search Engines     │
│         Team filters applied at ingestion time           │
└─────────────────────────────────────────────────────────┘
```

### User Context Flow

1. **User Authentication** → Firebase provides user UID
2. **User Profile** → Fetch user's selected sport and favorite teams
3. **Context Propagation** → Every API call includes: `{ sport, teamIds[] }`
4. **Agent Filtering** → All agents only process data for user's teams
5. **Fallback Mode** → If `teamIds = []`, provide sport-level overview

---

## Agent Architecture

### 1. Scores Agent

**Purpose:** Provide accurate, real-time game scores with cross-source validation **filtered by user's favorite teams**

**Team-Based Filtering:**
- When `teamIds` provided → Fetch only games involving those teams
- When `teamIds = []` → Fetch featured/top games for the sport (league overview)
- Never mix data from different teams in the same response

**Data Sources:**
- BallDontLie API (NBA) - Primary source
- Official league APIs (NBA.com, NFL.com, MLB.com)
- ESPN, CBS Sports (validation sources)

**Cadence:**
- Live games: 10-30 seconds (only for user's teams)
- Non-live games: Hourly (only for user's teams)
- Game schedules: Daily (only for user's teams)

**Implementation Details:**

```typescript
interface IScoreSource {
  fetchLive(teamCodes: string[]): Promise<GameScore[]>; // Multiple teams
  fetchSchedule(teamCodes: string[], startDate: Date, endDate: Date): Promise<Game[]>;
  fetchBoxScore(gameId: string): Promise<BoxScore>;
  fetchFeaturedGames(sport: string, limit: number): Promise<Game[]>; // For overview mode
}

class BallDontLieAdapter implements IScoreSource {
  // NBA implementation with team filtering
  async fetchLive(teamCodes: string[]): Promise<GameScore[]> {
    // Fetch games where home_team OR away_team in teamCodes
  }
}

class ValidationService {
  // Cross-source majority voting
  // Freshness checks to prevent stale data
  // Duplicate final detection
  validateForTeams(scores: GameScore[], teamIds: string[]): ValidatedScores;
}
```

**Data Flow:**
1. API request includes user's `teamIds` from context
2. Celery Beat triggers score fetch **per team**
3. Adapter fetches from multiple sources **filtered by teams**
4. ValidationService performs cross-source validation
5. Persist to `games` table with team associations
6. Publish WebSocket event **only to users following those teams**
7. Update cache with team-specific keys

**Cache Strategy:**
```typescript
// Team-specific cache
const cacheKey = teamIds.length > 0 
  ? `scores:teams:${teamIds.sort().join(',')}` 
  : `scores:sport:${sport}:featured`;
```

**SLO Targets:**
- Live updates: <5s p50 latency
- No duplicate final scores
- 99.9% accuracy through validation
- 100% team isolation (no cross-team data leakage)

---

### 2. News Scraping Agent

**Purpose:** Discover and rank relevant sports news **exclusively for user's selected favorite teams**

**Team-Based Filtering:**
- All scraped articles MUST be relevant to user's `teamIds`
- Articles indexed and stored per team (many-to-many relationship)
- When `teamIds = []` → Fetch league-wide trending news (no team filter)
- Team relevance score must be ≥95% to be associated with a team

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

**Relevance Filtering (Team-Based):**
- Team name/alias keyword matching
- Player name entity recognition
- Location/city matching
- Minimum relevance threshold: 95%
- **Articles ONLY indexed for teams that meet relevance threshold**
- **API responses filtered by user's teamIds at query time**

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
  teamIds: string[]; // ONLY teams meeting 95% relevance threshold
  entities: {
    players: string[];
    teams: string[];
    locations: string[];
  };
  trustScore: number;
}

// Query pattern for user requests
interface NewsQuery {
  userId: string;
  teamIds: string[]; // From user's profile
  category?: 'injury' | 'roster' | 'trade' | 'general';
  limit?: number;
}

// Response only includes articles where:
// article.teamIds ∩ user.teamIds ≠ ∅
// OR if user.teamIds = [], return sport-level trending articles
```

---

### 3. Content Classification Agent

**Purpose:** Categorize news articles into specific types using multi-corpus BM25 **for user's selected teams only**

**Team-Based Classification:**
- Classification performed ONLY on articles already filtered by user's teams
- Each team may have different classification distributions
- Classification results stored per team-article association

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

**Purpose:** Generate concise, accurate team summaries from top-ranked articles and recent scores **for each of user's selected teams**

**Team-Based Summary Generation:**
- **One summary generated per team** in user's `teamIds`
- Each summary uses ONLY that team's articles and scores
- When `teamIds = []` → Generate sport-level league summary
- Summaries cached per team, not per user

**AI Provider:** DeepSeek (cost-effective, high-quality)

**Input Sources (Per Team):**
1. Top-N articles **for this specific team** (freshness + trust weighted)
2. Latest game score **involving this team**
3. Recent results **for this team** (last 5 games)
4. Key statistics/trends **for this team**

**Summary Requirements:**
- Length: 2-3 sentences
- No hallucinated transactions or player moves
- Source citations required
- Balanced tone (not overly positive/negative)
- **Team name explicitly mentioned in summary**

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

**Purpose:** Discover and rank local fan experiences **exclusively for user's selected favorite teams**

**Team-Based Experience Discovery:**
- Only discover experiences for teams in user's `teamIds`
- Each experience associated with specific team(s)
- When `teamIds = []` → Show general sport-related events (no team filter)
- Geographic filtering combined with team filtering

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

**All endpoints require user authentication via Firebase ID token**  
**All endpoints automatically filter by user's selected teams from profile**

### Dashboard

```typescript
// Team-specific dashboard
GET /api/dashboard/:sport/:teamCode
Headers: { Authorization: "Bearer <firebase-token>" }
Response: {
  team: { id, name, logo },
  summary: {
    text: string, // Generated for THIS team only
    sources: string[],
    generatedAt: Date
  },
  latestScore: GameScore | null, // For THIS team only
  recentResults: Game[] // For THIS team only (last 5)
}

// Sport overview (when no team selected)
GET /api/dashboard/:sport
Headers: { Authorization: "Bearer <firebase-token>" }
Response: {
  sport: { name, logo },
  summary: {
    text: string, // League-level summary
    sources: string[],
    generatedAt: Date
  },
  featuredGames: Game[], // Top games in league
  standings: TeamStanding[] // League standings
}
```

### Updates (News)

```typescript
// Fetch news for user's teams
GET /api/updates
Headers: { Authorization: "Bearer <firebase-token>" }
Query Params: {
  category?: 'injury' | 'roster' | 'trade' | 'general',
  limit?: number,
  sourceType?: 'official' | 'major' | 'all'
}

// Automatically filters by user's teamIds from profile
// Returns ONLY articles where article.teamIds ∩ user.teamIds ≠ ∅

Response: {
  updates: Array<{
    id: string,
    teamId: string, // Which of user's teams this relates to
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

// Sport overview mode (when user.teamIds = [])
// Returns league-wide trending news
```

### Experiences

```typescript
// Fetch experiences for user's teams
GET /api/experiences
Headers: { Authorization: "Bearer <firebase-token>" }
Query Params: {
  location?: string, // User location for proximity
  radius?: number,   // Default 25 miles
  type?: 'watch-party' | 'tailgate' | 'bar' | 'meetup'
}

// Automatically filters by user's teamIds
// Returns ONLY experiences for user's teams

Response: {
  experiences: Array<{
    id: string,
    teamId: string, // Which of user's teams this is for
    type: string,
    title: string,
    description: string,
    location: string,
    distance: number, // Miles from user
    startTime: Date,
    attendees: number,
    userHasRsvped: boolean
  }>
}

POST /api/experiences/:id/rsvp
DELETE /api/experiences/:id/rsvp
// Both require authentication and validate experience belongs to user's teams
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

**All caching is team-specific to ensure proper data isolation**

| Data Type | Storage | TTL | Invalidation | Team Filtering |
|-----------|---------|-----|--------------|----------------|
| Live scores | Redis | 15-30s | Game final | Per team |
| Historical scores | Redis | 24h | Never | Per team |
| Articles (raw) | Redis | 1h | Source update | Per team association |
| BM25 indexes | Memory-mapped files | Persistent | New documents | Separate index per team |
| Classifications | PostgreSQL/MemStorage | Persistent | Manual correction | Per team-article pair |
| AI summaries | Redis | 10min | Breaking news, new game | **Per team** (not per user) |
| Team rankings | Redis | 5min | New articles | Per team |
| Sport overview | Redis | 15min | New trending news | Per sport (no team) |

### Cache Keys (Team-Based)

```typescript
const CACHE_KEYS = {
  // Scores - team specific
  liveScore: (teamId: string) => `score:live:team:${teamId}`,
  teamSchedule: (teamId: string) => `score:schedule:team:${teamId}`,
  
  // Scores - sport overview (no team)
  sportFeaturedGames: (sport: string) => `score:featured:sport:${sport}`,
  
  // Summaries - per team (shared across users)
  teamSummary: (teamId: string, contextHash: string) => `summary:team:${teamId}:${contextHash}`,
  
  // Summaries - sport overview
  sportSummary: (sport: string, contextHash: string) => `summary:sport:${sport}:${contextHash}`,
  
  // News - per team
  teamNews: (teamId: string, category: string) => `news:team:${teamId}:${category}`,
  bm25Ranking: (teamId: string, category: string) => `rank:team:${teamId}:${category}`,
  
  // News - sport overview
  sportNews: (sport: string) => `news:sport:${sport}:trending`,
  
  // Experiences - per team
  teamExperiences: (teamId: string, location: string) => `exp:team:${teamId}:${location}`,
  
  // Deduplication (global)
  articleFingerprint: (url: string) => `fingerprint:${url}`,
};
```

### Team Isolation Guarantee

**Critical:** Cache keys MUST include team identifier to prevent cross-user data leakage:
- ✅ User A (Lakers fan) and User B (Lakers fan) share cache → `summary:team:lakers:hash123`
- ✅ User A (Lakers fan) and User C (Warriors fan) have separate caches → Different keys
- ❌ Never use userId in cache key → Prevents cache sharing for same team

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

2. **Team-Based Data Isolation (CRITICAL)**
   - **Every API request validates user has access to requested team**
   - Fetch user's teamIds from profile on each request
   - Block requests for teams not in user's profile
   - Audit log all team access attempts
   - Example validation:
   ```typescript
   async function validateTeamAccess(userId: string, requestedTeamId: string): Promise<boolean> {
     const userProfile = await getUserProfile(userId);
     return userProfile.favoriteTeams.includes(requestedTeamId);
   }
   ```

3. **Cost Controls**
   - DeepSeek API budget limits
   - Request throttling on expensive operations
   - Alert on unusual usage patterns

4. **Input Validation**
   - Zod schemas for all request bodies
   - SQL injection prevention
   - XSS sanitization on article content
   - **Validate teamIds array in all requests**

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

## Personalization Implementation Summary

### Core Principle: Team-First Architecture

**Every data operation in the system is filtered by the user's selected favorite teams.** This is not an optional feature—it's the foundational architecture of the entire platform.

### Implementation Pattern

```typescript
// 1. User Context Extraction (Every Request)
async function getUserContext(userId: string): Promise<UserContext> {
  const profile = await storage.getUserProfile(userId);
  return {
    userId,
    sport: profile.selectedSport,
    teamIds: profile.favoriteTeams, // Array of team IDs
  };
}

// 2. Team Filtering (Every Agent)
async function fetchTeamData(context: UserContext) {
  if (context.teamIds.length > 0) {
    // Team-specific mode
    return await fetchDataForTeams(context.teamIds);
  } else {
    // Sport overview mode
    return await fetchSportOverview(context.sport);
  }
}

// 3. Response Validation (Every Endpoint)
function validateResponse(response: any, userTeamIds: string[]) {
  // Ensure response only contains data for user's teams
  const dataTeamIds = extractTeamIds(response);
  const unauthorized = dataTeamIds.filter(id => !userTeamIds.includes(id));
  
  if (unauthorized.length > 0) {
    throw new Error('Data leakage detected: Unauthorized team data in response');
  }
}
```

### Agent-by-Agent Filtering

**Scores Agent:**
- Input: `teamIds[]` from user context
- Process: Fetch games where `home_team IN teamIds OR away_team IN teamIds`
- Fallback: If `teamIds = []`, fetch featured games for sport
- Cache: `score:live:team:${teamId}` or `score:featured:sport:${sport}`

**News Agent:**
- Input: `teamIds[]` from user context
- Process: Query BM25 index filtered by `article.teamIds ∩ user.teamIds ≠ ∅`
- Fallback: If `teamIds = []`, fetch trending sport news
- Cache: `news:team:${teamId}:${category}` or `news:sport:${sport}:trending`

**Classification Agent:**
- Input: Articles already filtered by user's teams
- Process: Classify only articles relevant to user's teams
- Storage: Classification stored per team-article association

**AI Summary Bot:**
- Input: Top articles + scores for specific team
- Process: Generate summary for ONE team at a time
- Fallback: If `teamIds = []`, generate league-wide summary
- Cache: `summary:team:${teamId}:${hash}` (shared across users of same team)

**Experience Agent:**
- Input: `teamIds[]` + user location
- Process: Discover experiences for user's teams within radius
- Fallback: If `teamIds = []`, show general sport events
- Cache: `exp:team:${teamId}:${location}`

### Data Flow Example

**User: Lakers Fan**
```
1. User logs in → Firebase UID: abc123
2. Fetch profile → { sport: 'NBA', teamIds: ['lakers'] }
3. API Request: GET /api/dashboard/nba/lakers
4. Header: Authorization: Bearer <firebase-token>

Backend Processing:
5. Extract user from token → UID: abc123
6. Fetch user context → { sport: 'NBA', teamIds: ['lakers'] }
7. Validate: 'lakers' in user.teamIds ✓
8. Scores Agent: Fetch games for Lakers
9. News Agent: Query BM25 index WHERE teamIds CONTAINS 'lakers'
10. Summary Agent: Generate summary using Lakers data only
11. Cache results with key: summary:team:lakers:hash456

Response:
12. Return Lakers-only data
13. Validate: All response data belongs to Lakers ✓
```

**User: No Team Selected (Sport Overview)**
```
1. User logs in → Firebase UID: xyz789
2. Fetch profile → { sport: 'NBA', teamIds: [] }
3. API Request: GET /api/dashboard/nba

Backend Processing:
4. Extract user from token → UID: xyz789
5. Fetch user context → { sport: 'NBA', teamIds: [] }
6. Detect overview mode: teamIds.length === 0
7. Scores Agent: Fetch featured NBA games (top 5)
8. News Agent: Fetch trending NBA news (league-wide)
9. Summary Agent: Generate NBA league summary
10. Cache results with key: summary:sport:nba:hash789

Response:
11. Return sport-level overview data
12. No team-specific filtering applied
```

### Security Boundaries

**Critical Validations:**

1. **Request Validation**
   ```typescript
   // Every protected endpoint
   app.get('/api/*', authenticateFirebase, async (req, res) => {
     const userId = req.user.uid;
     const userContext = await getUserContext(userId);
     
     // Validate any teamId in request belongs to user
     if (req.query.teamId && !userContext.teamIds.includes(req.query.teamId)) {
       return res.status(403).json({ error: 'Unauthorized team access' });
     }
     
     // Attach context to request
     req.userContext = userContext;
     next();
   });
   ```

2. **Response Validation**
   ```typescript
   // Before sending response
   function validateTeamData(data: any, allowedTeamIds: string[]) {
     const dataTeamIds = extractAllTeamIds(data);
     const unauthorized = dataTeamIds.filter(id => !allowedTeamIds.includes(id));
     
     if (unauthorized.length > 0) {
       logger.error('Data leakage detected', { unauthorized, allowedTeamIds });
       throw new Error('Security violation: Unauthorized team data');
     }
   }
   ```

3. **Audit Logging**
   ```typescript
   // Log all team access
   logger.info('Team data access', {
     userId: user.uid,
     requestedTeams: extractTeamIds(request),
     authorizedTeams: user.teamIds,
     endpoint: request.path,
     timestamp: new Date()
   });
   ```

### Testing Requirements

**Every feature MUST include tests for:**

1. ✅ Team-specific data filtering works correctly
2. ✅ Sport overview mode works when no team selected
3. ✅ User cannot access data for teams not in their profile
4. ✅ Cache isolation prevents cross-team data leakage
5. ✅ Switching teams immediately shows correct data
6. ✅ Multiple teams in profile shows combined data (where appropriate)

### Success Validation

**The system is correctly implemented when:**

- User A (Lakers fan) sees ONLY Lakers content
- User B (Warriors fan) sees ONLY Warriors content
- User C (no team selected) sees league overview
- User D (Lakers + Warriors fan) sees content for BOTH teams
- No user ever sees content for teams they don't follow
- Cache is shared efficiently for users following the same teams
- Switching teams instantly shows correct filtered content

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
