# Sports Media Platform - Implementation Plan

## Overview
Transform the completed UI design into a fully functional sports media platform with user authentication, real-time sports data, AI-powered summaries, and fan experiences.

## Architecture Summary

### Tech Stack
- **Frontend**: React + TypeScript + React Query v5 + Wouter
- **Backend**: Express + TypeScript
- **Storage**: MemStorage (MVP) → easily swappable to PostgreSQL
- **External APIs**: 
  - BallDontLie (NBA scores/games)
  - News API (future)
  - OpenAI (AI summaries)

### Design Principles
- Thin Express API over MemStorage
- Most logic on frontend with React Query
- Typed via shared/schema.ts
- Validated by drizzle-zod
- Provider abstractions for sports/news/LLM
- Aggressive caching with smart invalidation

---

## Data Model (shared/schema.ts)

### Core Tables

#### users
```typescript
{
  id: string (UUID)
  username: string (unique)
  passwordHash: string
}
```

#### sessions
```typescript
{
  id: string (UUID)
  userId: string (FK)
  expiresAt: Date
}
```

#### teams
```typescript
{
  id: string
  league: 'nba' | 'nfl' | 'mlb' | 'nhl'
  code: string (e.g., 'GSW')
  name: string (e.g., 'Warriors')
}
```

#### userTeams
```typescript
{
  userId: string (FK)
  teamId: string (FK)
}
```

#### summaries
```typescript
{
  id: string
  teamId: string (FK)
  content: string
  generatedAt: Date
  model: string
}
```

#### games (cache entity)
```typescript
{
  id: string
  homeTeamId: string (FK)
  awayTeamId: string (FK)
  homePts: number
  awayPts: number
  status: 'SCHEDULED' | 'LIVE' | 'FINAL'
  period: string
  timeRemaining: string
  startTime: Date
}
```

#### updates
```typescript
{
  id: string
  teamId: string (FK)
  category: 'news' | 'injury' | 'trade' | 'free_agency'
  title: string
  description: string
  timestamp: Date
  source: string
}
```

#### experiences
```typescript
{
  id: string
  teamId: string (FK)
  type: 'watch_party' | 'tailgate' | 'meetup' | 'viewing'
  title: string
  description: string
  location: string
  start_time: Date
}
```

#### rsvps
```typescript
{
  id: string
  experienceId: string (FK)
  userId: string (FK)
}
```

---

## Backend API Routes (server/routes.ts)

### Authentication
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Login with credentials
- `POST /api/auth/logout` - Clear session
- `GET /api/auth/me` - Get current user info

**Auth Flow**: httpOnly cookie with SameSite=Lax, bcrypt password hashing

### Teams & Onboarding
- `GET /api/leagues` - List all available leagues
- `GET /api/teams?league=nba` - Get teams by league
- `GET /api/user/teams` - Get user's selected teams
- `POST /api/user/teams` - Update user's team selection

**Initial Data**: Seed NBA teams on startup

### Dashboard (Composition Endpoint)
- `GET /api/teams/:id/dashboard` - Returns:
  ```typescript
  {
    team: Team
    summary: Summary
    latestScore: Game
    recentResults: Game[]
  }
  ```

### Summaries
- `GET /api/teams/:id/summary` - Get/generate AI summary
  - Query param: `?refresh=1` to force regeneration
  - Cache TTL: 30-60 minutes

### Scores & Games
- `GET /api/teams/:id/latest-score` - Latest game result
- `GET /api/teams/:id/recent-results` - Last 5 games

**Caching Strategy**:
- LIVE games: 15-30 seconds
- FINAL games: 1 hour
- Invalidate when stale

### Updates Feed
- `GET /api/updates?teamId&category` - Filter by team and category
- `POST /api/updates` - Create update (protected, admin)

### Fan Experiences
- `GET /api/experiences?teamId` - Get experiences by team
- `POST /api/experiences` - Create new experience (protected)
- `POST /api/experiences/:id/rsvp` - RSVP to event (protected)
- `GET /api/experiences/:id/attendees` - Get attendee count

---

## Providers & External Services

### SportsDataProvider (BallDontLie for NBA)
```typescript
interface ISportsDataProvider {
  getLatestGame(teamId: string): Promise<Game>
  getRecentGames(teamId: string, limit: number): Promise<Game[]>
  getUpcomingGames(teamId: string): Promise<Game[]>
}
```
**Caching**: Store in MemStorage with TTL

### NewsProvider (Manual Entry → GNews/NewsAPI)
```typescript
interface INewsProvider {
  getUpdates(teamId: string, category: string): Promise<Update[]>
  createUpdate(update: Update): Promise<Update>
}
```
**MVP**: Manual POST, plan periodic fetch every 10-15 minutes

### AIProvider (OpenAI)
```typescript
interface IAIProvider {
  generateSummary(teamData: TeamContext): Promise<string>
}
```
**Caching**: 30-60 minutes per team, refreshable

---

## Frontend Data Flow (React Query v5)

### Query Keys Structure
```typescript
['/api/auth/me']
['/api/teams', league]
['/api/user/teams']
['/api/teams', id, 'dashboard']
['/api/updates', { teamId, category }]
['/api/experiences', teamId]
```

### Key Mutations
- Login/Logout → Invalidate `['/api/auth/me']`
- Select teams → Invalidate `['/api/user/teams']`
- Create update → Invalidate `['/api/updates', ...]`
- RSVP → Invalidate `['/api/experiences', ...]`

### Forms
- Use shadcn Form + react-hook-form
- Validation via zodResolver
- Insert schemas from shared/schema.ts

---

## Implementation Phases

### Phase 0: Foundation
**Tasks 1-2**
- [ ] Define complete database schema in shared/schema.ts
- [ ] Extend IStorage interface with CRUD methods for all entities
- [ ] Create insert/select schemas with drizzle-zod

**Acceptance**: TS compiles, types used across server/client

---

### Phase 1: Authentication
**Tasks 3-4**
- [ ] Implement auth routes (register, login, logout, /me)
- [ ] Add session middleware with httpOnly cookies
- [ ] Create login/signup forms
- [ ] Wire profile icon to show login state
- [ ] Protected route middleware

**Acceptance**: Cookie-based sessions work end-to-end, profile reflects state

---

### Phase 2: Team Onboarding
**Tasks 5-6**
- [ ] Seed NBA teams data
- [ ] Create team selection endpoints
- [ ] Build onboarding flow UI
- [ ] Persist user team selections
- [ ] Update sport dropdown to filter teams

**Acceptance**: Selection survives refresh, teams load from API

---

### Phase 3: Live Sports Data
**Tasks 7-9**
- [ ] Implement BallDontLie API wrapper
- [ ] Add caching layer for game data
- [ ] Create dashboard composition endpoint
- [ ] Replace mock data in AISummarySection
- [ ] Replace mock data in ScoresWidget
- [ ] Add loading skeletons

**Acceptance**: Real NBA scores display, caching works, UI shows proper states

---

### Phase 4: Updates Feed
**Tasks 10-11**
- [ ] Create updates GET endpoint with filters
- [ ] Add POST endpoint for manual entry
- [ ] Wire RecentUpdatesSection to API
- [ ] Implement category filtering
- [ ] Set up cache invalidation

**Acceptance**: Updates load by category, POST creates new updates

---

### Phase 5: Fan Experiences
**Tasks 12-13**
- [ ] Build experiences CRUD endpoints
- [ ] Add RSVP functionality
- [ ] Connect FanExperiencesSection to API
- [ ] Implement attendee count updates
- [ ] Add optimistic UI updates

**Acceptance**: Users can RSVP, counts update in real-time

---

### Phase 6: AI Summaries
**Task 14**
- [ ] Create AIProvider abstraction
- [ ] Integrate OpenAI API
- [ ] Implement summary generation endpoint
- [ ] Add caching with refresh flag
- [ ] Display in dashboard

**Acceptance**: AI summaries generate and cache properly

---

### Phase 7: Security & Polish
**Task 15**
- [ ] Add rate limiting (auth, summaries)
- [ ] Input validation via Zod on all endpoints
- [ ] Add structured logging
- [ ] Security audit (bcrypt, httpOnly, SameSite)
- [ ] Error handling consistency

**Acceptance**: No security vulnerabilities, proper error handling

---

## Security Considerations

### Authentication
- ✅ bcrypt for password hashing (salt rounds: 10)
- ✅ httpOnly cookies with SameSite=Lax
- ✅ Session expiration (7 days default)
- ✅ CSRF protection via SameSite

### Input Validation
- ✅ Zod schemas on all request bodies
- ✅ Sanitize user inputs
- ✅ Type checking via TypeScript

### Rate Limiting
- Auth endpoints: 5 requests/minute per IP
- Summary generation: 10 requests/hour per user
- General API: 100 requests/minute per user

### Secrets Management
- Backend env variables only
- Never expose API keys to frontend
- Rotate secrets regularly

---

## Deployment Considerations

### Current Setup
- Single Express process serves Vite + API
- No proxy needed (already configured)
- Port 5000 for all traffic

### Future Improvements
- Swap MemStorage → PostgreSQL (implement new IStorage)
- Add Redis for session storage
- Horizontal scaling with load balancer
- CDN for static assets
- Background jobs for news fetching

### Monitoring
- Structured logging (Winston/Pino)
- Error tracking (Sentry)
- Performance monitoring
- API usage metrics

---

## API Response Formats

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-20T10:00:00Z"
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid credentials"
  }
}
```

---

## Testing Strategy

### Unit Tests
- Provider functions
- Storage CRUD operations
- Validation schemas

### Integration Tests
- API endpoints
- Auth flow
- Cache invalidation

### E2E Tests (Playwright)
- User registration/login
- Team selection flow
- Dashboard data loading
- RSVP functionality

---

## Future Enhancements

### Additional Sports
- NFL, MLB, NHL team support
- Multi-sport dashboards
- Cross-sport comparisons

### Social Features
- User profiles with stats
- Follow other fans
- Comments on updates
- Share experiences

### Advanced Features
- Push notifications for games
- Live chat during events
- Ticket integration
- Merchandise links
- Fantasy integration

---

## Success Metrics

### Phase 0-2 (Foundation)
- All schemas defined and typed
- Auth flow works end-to-end
- Users can select teams

### Phase 3-5 (Core Features)
- Real sports data displays
- Updates feed populated
- Fan experiences functional

### Phase 6-7 (Polish)
- AI summaries generating
- No security vulnerabilities
- Performance < 200ms avg response

---

## Timeline Estimate

- **Phase 0-1**: 2-3 hours (Foundation + Auth)
- **Phase 2**: 1-2 hours (Onboarding)
- **Phase 3**: 2-3 hours (Sports Data)
- **Phase 4**: 1-2 hours (Updates)
- **Phase 5**: 2-3 hours (Experiences)
- **Phase 6**: 1-2 hours (AI)
- **Phase 7**: 1-2 hours (Security)

**Total**: 10-17 hours for MVP

---

## Next Steps

1. ✅ Design complete
2. ✅ Implementation plan created
3. ⏭️ Start Phase 0: Define database schema
4. ⏭️ Build out each phase sequentially
5. ⏭️ Test thoroughly between phases
6. ⏭️ Deploy and monitor

---

*Last Updated: January 29, 2025*
