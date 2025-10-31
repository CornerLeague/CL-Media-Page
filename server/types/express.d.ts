import 'express';

declare global {
  namespace Express {
    /** Minimal authenticated user context populated by Firebase auth middleware */
    interface AuthenticatedUser {
      uid: string;
      email?: string;
      name?: string;
    }

    /** Normalized query params after validation middleware */
    interface ValidatedQuery {
      sport?: string;
      teamIds?: string[];
      limit?: number;
      startDate?: string; // ISO date string (YYYY-MM-DD)
      endDate?: string; // ISO date string (YYYY-MM-DD)
    }

    /** Params for routes such as /api/scores/:gameId */
    interface ValidatedParams {
      gameId?: string;
    }

    /** Loaded user context used for access control */
    interface UserContext {
      userId: string; // internal storage user id
      firebaseUid: string; // Firebase UID
      teamIds: string[]; // teams the user follows/has access to
      preferredSport?: string; // optional preferred sport from profile
    }

    /** Access context computed by team access guard */
    interface AccessContext {
      mode: 'requested' | 'favorites' | 'overview';
      sport: string | null;
      authorizedTeamIds: string[];
    }

    interface Request {
      /** Set by Firebase auth middleware when token is valid */
      user?: AuthenticatedUser;

      /** Set by validation middleware(s) after Zod-based normalization */
      validated?: {
        query?: ValidatedQuery;
        params?: ValidatedParams;
      };

      /** Set by loadUserContext middleware based on authenticated user */
      userContext?: UserContext;

      /** Set by team access guard middleware to convey access mode and scope */
      access?: AccessContext;
    }

  }
}

export {}; // ensure this file is treated as a module