# Phase 2 – Priority 5: Testing & Documentation — Subtask Plan

## Integration Tests Added

- Schedule API integration test (server/tests/integration/scheduleApi.test.ts)
  - Uses dev auth fallback via `x-dev-firebase-uid` and `NODE_ENV=development` without Firebase envs
  - Seeds teams and games via dev endpoints
  - Verifies league scoping, favorites fallback, authorization checks, and pagination defaults

## Notes
- Tests start the Express app on an ephemeral port (server.listen(0)) and make requests with Node fetch
- CSRF protection remains limited to auth endpoints; schedule route uses rate limiter + auth + validation + team access guard
- package.json devDependencies include supertest and @types/supertest for potential future tests, although current test uses fetch.
