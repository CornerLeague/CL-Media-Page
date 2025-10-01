# Sports Media Platform - Corner League Media

## Project Status: BUILD 🚀

## Overview
A **team-based personalized** sports media platform featuring AI-powered summaries, live scores, categorized news, and fan experiences. Built with React, TypeScript, Express, and BM25-powered content ranking.

**Core Architecture:** All data sources filter exclusively by user's selected favorite teams. When no team is selected, the platform displays sport-level overview content.

## Current Phase
**Phase 0: Foundation** - Backend architecture complete, ready for implementation

## Design Status
✅ Complete - All UI components designed and implemented
- iOS-inspired minimalist design
- Dark/light theme support
- Responsive layout
- NBA sport selection (expandable to NFL, MLB, NHL, and 11 more sports)

## Implementation Status
📋 **Backend Planning Complete:**
- ✅ Backend Implementation Plan (900+ lines) - Complete
- ✅ Task Breakdown Document (40 tasks, 200+ subtasks) - Complete
- ⏭️ Ready to begin 10-week implementation

## Key Features

### Personalization (CORE)
- **Team-based filtering:** Every data source filters by user's favorite teams
- **Sport overview mode:** When no team selected, shows league-wide content
- **Multi-team support:** Users can follow multiple teams
- **Instant switching:** Change teams and see filtered content immediately

### Content Features
- User authentication and profiles (Firebase)
- Team selection/onboarding
- AI-powered team summaries (DeepSeek)
- Live scores with cross-source validation
- Categorized news updates (Injuries, Trades, Roster, General News)
- BM25-ranked content relevance
- Fan experiences (watch parties, tailgates, meetups)
- RSVP functionality

## Tech Stack

### Frontend
- React, TypeScript, React Query, Wouter
- Tailwind CSS, shadcn/ui
- Firebase Authentication

### Backend (Planned)
- Express, TypeScript, Celery Beat
- BM25 indexing with memory-mapped files
- MinHash deduplication
- Redis caching (team-specific keys)
- DeepSeek AI for summaries

### Data Sources
- **Scores:** BallDontLie API, Official League APIs, ESPN
- **News:** ESPN RSS, CBS Sports, Bleacher Report, The Athletic, Official team sites, Google News API
- **Experiences:** Calendar feeds, Sports bars, Meetup/Facebook Events

### Storage
- MemStorage (MVP) → PostgreSQL (production)
- Per-team BM25 indexes
- Team-based cache isolation

## Architecture Principles

### Team-First Data Flow
```
User Profile (teamIds) 
  → API Request (filtered by teams)
    → Agents (process only user's teams)
      → BM25 Indexes (per-team)
        → Response (validated team isolation)
```

### Agent Architecture
1. **Scores Agent** (10-30s) - Live scores for user's teams only
2. **News Scraping Agent** (10min) - Articles relevant to user's teams (≥95% relevance)
3. **Classification Agent** (5min) - Categorize team news (injury/roster/trade/general)
4. **AI Summary Bot** (10min) - Generate summaries per team using DeepSeek
5. **Fan Experience Agent** (daily) - Discover events for user's teams

## Documentation

### Implementation Guides
- `Backend_Implementation_Plan.md` - **Complete backend architecture** (900+ lines)
  - Team-based filtering architecture
  - All 5 agents with detailed specs
  - BM25 indexing implementation
  - API endpoints with team validation
  - Caching strategy (team-specific keys)
  - Security & data isolation

- `Implementation_Task_Breakdown.md` - **Detailed task plan** (40 tasks, 200+ subtasks)
  - Phase 1: Foundation & Infrastructure (2 weeks)
  - Phase 2: Scores Agent (1 week)
  - Phase 3: News Scraping Agent (2 weeks)
  - Phase 4: Classification Agent (1 week)
  - Phase 5: AI Summary Bot (1 week)
  - Phase 6: Fan Experiences (1 week)
  - Phase 7: Polish & Production (2 weeks)

## Key Design Decisions

### Personalization
- **Decision:** All data filtered by user's selected teams
- **Rationale:** Provides truly personalized experience, prevents information overload
- **Implementation:** Team validation on every request, per-team caching, security boundaries

### BM25 Ranking
- **Decision:** Use BM25 algorithm for content ranking vs. ML models
- **Rationale:** Explainable, fast, no training data needed, works well for sports content
- **Implementation:** Memory-mapped indexes per team, k1=1.5, b=0.75

### DeepSeek AI
- **Decision:** Use DeepSeek for AI summaries vs. OpenAI
- **Rationale:** Cost-effective, high quality, good for sports content
- **Implementation:** Per-team summaries, 10min cache, breaking news invalidation

### Ethical Web Scraping
- **Decision:** Implement comprehensive scraping ethics
- **Rationale:** Respect content creators, avoid legal issues, sustainable approach
- **Implementation:** robots.txt compliance, 1-2 req/s rate limits, source attribution

## Success Metrics

### Data Quality
- ✓ 95%+ news relevance to selected teams
- ✓ <1% duplicate articles
- ✓ 90%+ classification precision
- ✓ Live scores within 30s
- ✓ 100% team isolation (no cross-user data leakage)

### User Experience
- ✓ Dashboard loads <2s
- ✓ News updates every 10min
- ✓ Accurate AI summaries
- ✓ Real-time score updates

### System Health
- ✓ 99.9% API uptime
- ✓ Zero scraper ethics violations
- ✓ AI costs under budget
- ✓ All agents on schedule

## Next Steps

### Immediate (Week 1-2)
1. Extend database schema for articles, classifications, indexes
2. Update storage interface with team-based CRUD
3. Build BM25 indexing module
4. Implement MinHash deduplication
5. Set up Celery Beat infrastructure

### Short-term (Week 3-8)
1. Build all 5 backend agents
2. Wire up frontend to real data
3. Implement team-based filtering
4. Add caching and optimization

### Final (Week 9-10)
1. Admin endpoints
2. Monitoring and alerts
3. Security hardening
4. End-to-end testing
5. Production deployment

---

*Status Updated: October 1, 2025*  
*Backend Architecture: Complete*  
*Implementation Timeline: 10 weeks*
