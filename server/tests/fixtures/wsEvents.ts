import type { UserTeamScoreUpdate, UserTeamStatusChange } from '../../types/websocket';
import { sampleGames, sampleTeams, sampleUserProfiles } from './userTeamScoresData';
import { makeScoreUpdate, makeStatusChange } from './updateHelpers';

// Deterministic WebSocket fixtures for tests

// NHL live score update: Rangers vs Maple Leafs (game-007)
const nhlUser = sampleUserProfiles.find(p => p.firebaseUid === 'firebase-uid-004')!;
const nhlTeamRangers = sampleTeams.find(t => t.id === 'NHL_NYR')!;
const nhlGameLive = sampleGames.find(g => g.id === 'game-007')!;

export const wsScoreUpdateNHL: UserTeamScoreUpdate = makeScoreUpdate(
  nhlUser.firebaseUid,
  nhlTeamRangers,
  nhlGameLive,
  true
);

// NBA live score update: Warriors vs Bulls (game-002)
const nbaUser = sampleUserProfiles.find(p => p.firebaseUid === 'firebase-uid-002')!;
const nbaTeamWarriors = sampleTeams.find(t => t.id === 'NBA_GSW')!;
const nbaGameLive = sampleGames.find(g => g.id === 'game-002')!;

export const wsScoreUpdateNBA: UserTeamScoreUpdate = makeScoreUpdate(
  nbaUser.firebaseUid,
  nbaTeamWarriors,
  nbaGameLive,
  true
);

// Status change example: NHL scheduled -> in_progress for Bruins vs Maple Leafs (game-008)
const nhlTeamBruins = sampleTeams.find(t => t.id === 'NHL_BOS')!;
const nhlGameScheduled = sampleGames.find(g => g.id === 'game-008')!;

export const wsStatusChangeNHL: UserTeamStatusChange = makeStatusChange(
  nhlUser.firebaseUid,
  nhlTeamBruins.id,
  nhlGameScheduled.id,
  'scheduled',
  'in_progress'
);

export default {
  wsScoreUpdateNHL,
  wsScoreUpdateNBA,
  wsStatusChangeNHL,
};