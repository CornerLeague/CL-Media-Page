// Simple test script for the new user team scores endpoint

const baseUrl = 'http://localhost:5000';
const devUid = 'test-uid-123';

async function testUserTeamScoresEndpoint() {
  console.log('Testing /api/user-team-scores endpoint...\n');

  // Test 1: Valid request with sport parameter
  console.log('Test 1: Valid request with NBA sport');
  try {
    const url = new URL(baseUrl + '/api/user-team-scores');
    url.searchParams.append('sport', 'nba');
    url.searchParams.append('limit', '5');
    
    const response = await fetch(url, {
      headers: { 'x-dev-firebase-uid': devUid },
    });
    
    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('✅ Test 1 completed\n');
  } catch (error) {
    console.error('❌ Test 1 failed:', error);
  }

  // Test 2: Missing sport parameter (should return 400)
  console.log('Test 2: Missing required sport parameter');
  try {
    const url = new URL(baseUrl + '/api/user-team-scores');
    url.searchParams.append('limit', '5');
    
    const response = await fetch(url, {
      headers: { 'x-dev-firebase-uid': devUid },
    });
    
    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('✅ Test 2 completed\n');
  } catch (error) {
    console.error('❌ Test 2 failed:', error);
  }

  // Test 3: Invalid sport parameter (should return 400)
  console.log('Test 3: Invalid sport parameter');
  try {
    const url = new URL(baseUrl + '/api/user-team-scores');
    url.searchParams.append('sport', 'invalid-sport');
    url.searchParams.append('limit', '5');
    
    const response = await fetch(url, {
      headers: { 'x-dev-firebase-uid': devUid },
    });
    
    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('✅ Test 3 completed\n');
  } catch (error) {
    console.error('❌ Test 3 failed:', error);
  }

  // Test 4: Missing authentication (should return 401)
  console.log('Test 4: Missing authentication');
  try {
    const url = new URL(baseUrl + '/api/user-team-scores');
    url.searchParams.append('sport', 'nba');
    
    const response = await fetch(url);
    
    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('✅ Test 4 completed\n');
  } catch (error) {
    console.error('❌ Test 4 failed:', error);
  }

  console.log('All tests completed!');
}

testUserTeamScoresEndpoint().catch(console.error);