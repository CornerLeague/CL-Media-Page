import { describe, it, expect } from 'vitest';

describe('User Team Scores Endpoint - Simple Integration', () => {
  const baseUrl = 'http://localhost:3001';

  it('should return 403 for missing authentication', async () => {
    const response = await fetch(`${baseUrl}/api/user-team-scores?sport=NBA&limit=10`);
    
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Authentication required');
  });

  it('should return 400 for missing sport parameter', async () => {
    const response = await fetch(`${baseUrl}/api/user-team-scores?limit=10`, {
      headers: {
        'x-dev-firebase-uid': 'test-user'
      }
    });
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Sport parameter is required');
  });

  it('should return 400 for invalid sport parameter', async () => {
    const response = await fetch(`${baseUrl}/api/user-team-scores?sport=INVALID&limit=10`, {
      headers: {
        'x-dev-firebase-uid': 'test-user'
      }
    });
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid sport. Supported sports: NBA, NFL, NHL, MLB');
  });

  it('should handle valid request structure', async () => {
    const response = await fetch(`${baseUrl}/api/user-team-scores?sport=NBA&limit=5`, {
      headers: {
        'x-dev-firebase-uid': 'test-user-123'
      }
    });
    
    // The response should be structured correctly, even if user doesn't exist
    // We expect either 404 (user not found) or 200 (empty array or games)
    expect([200, 404].includes(response.status)).toBe(true);
    
    const data = await response.json();
    if (response.status === 200) {
      expect(Array.isArray(data)).toBe(true);
    } else if (response.status === 404) {
      expect(data.error).toBeDefined();
    }
  });

  it('should validate limit parameter', async () => {
    const response = await fetch(`${baseUrl}/api/user-team-scores?sport=NBA&limit=abc`, {
      headers: {
        'x-dev-firebase-uid': 'test-user'
      }
    });
    
    // Should handle invalid limit gracefully (either 400 or default to 10)
    expect([200, 400, 404].includes(response.status)).toBe(true);
  });
});