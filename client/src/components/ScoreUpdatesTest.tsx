import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, Wifi, WifiOff, Bell, BellOff, Filter, Trash2 } from 'lucide-react';
import { useScoreUpdates, type ScoreUpdateEvent, type ScoreUpdateError } from '@/hooks/useScoreUpdates';
import { Sport } from '@/data/sportsTeams';

/**
 * Test component for the useScoreUpdates hook
 * Demonstrates event filtering, error handling, and real-time updates
 */
export function ScoreUpdatesTest() {
  const [selectedSports, setSelectedSports] = useState<Sport[]>(['NFL']);
  const [userTeamsOnly, setUserTeamsOnly] = useState(false);
  const [minScoreDiff, setMinScoreDiff] = useState<number>(0);
  const [debugMode, setDebugMode] = useState(false);
  
  // Initialize the hook with test configuration
  const {
    connectionState,
    isConnected,
    latestUpdate,
    recentUpdates,
    errors,
    currentFilters,
    connect,
    disconnect,
    updateFilters,
    clearUpdates,
    clearErrors,
    subscribeToSport,
    unsubscribeFromSport,
  } = useScoreUpdates({
    filters: {
      sports: selectedSports,
      userTeamsOnly,
      minScoreDifference: minScoreDiff,
    },
    debug: debugMode,
    onScoreUpdate: useCallback((event: ScoreUpdateEvent) => {
      console.log('Score update received:', event);
    }, []),
    onError: useCallback((error: ScoreUpdateError) => {
      console.error('Score update error:', error);
    }, []),
  });

  // Handle filter updates
  const handleSportChange = (sport: string) => {
    const newSports = sport === 'all' ? [] : [sport as Sport];
    setSelectedSports(newSports);
    updateFilters({ sports: newSports });
  };

  const handleUserTeamsToggle = (checked: boolean) => {
    setUserTeamsOnly(checked);
    updateFilters({ userTeamsOnly: checked });
  };

  const handleMinScoreDiffChange = (value: string) => {
    const num = parseInt(value) || 0;
    setMinScoreDiff(num);
    updateFilters({ minScoreDifference: num });
  };

  const handleSubscribeToSport = (sport: Sport) => {
    subscribeToSport(sport);
  };

  // Connection status indicator
  const getConnectionStatus = () => {
    switch (connectionState) {
      case 'connected':
        return { icon: <Wifi className="w-4 h-4" />, color: 'text-green-600', text: 'Connected' };
      case 'connecting':
        return { icon: <Wifi className="w-4 h-4 animate-pulse" />, color: 'text-yellow-600', text: 'Connecting' };
      case 'disconnected':
        return { icon: <WifiOff className="w-4 h-4" />, color: 'text-gray-600', text: 'Disconnected' };
      case 'error':
        return { icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-600', text: 'Error' };
      default:
        return { icon: <WifiOff className="w-4 h-4" />, color: 'text-gray-600', text: 'Unknown' };
    }
  };

  const status = getConnectionStatus();

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Score Updates Test
            <Badge variant={isConnected ? 'default' : 'secondary'} className={status.color}>
              {status.icon}
              {status.text}
            </Badge>
          </CardTitle>
          <CardDescription>
            Test component for the useScoreUpdates hook with filtering and error handling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Controls */}
          <div className="flex gap-2">
            <Button onClick={connect} disabled={isConnected} variant="outline">
              Connect
            </Button>
            <Button onClick={disconnect} disabled={!isConnected} variant="outline">
              Disconnect
            </Button>
          </div>

          <Separator />

          {/* Filter Controls */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Event Filters
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Sport Filter */}
              <div className="space-y-2">
                <Label htmlFor="sport-select">Sport</Label>
                <Select value={selectedSports[0] || 'all'} onValueChange={handleSportChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sports</SelectItem>
                    <SelectItem value="NFL">NFL</SelectItem>
                    <SelectItem value="NBA">NBA</SelectItem>
                    <SelectItem value="MLB">MLB</SelectItem>
                    <SelectItem value="NHL">NHL</SelectItem>
                    <SelectItem value="Soccer">Soccer</SelectItem>
                    <SelectItem value="College Football">College Football</SelectItem>
                    <SelectItem value="College Basketball">College Basketball</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* User Teams Only */}
              <div className="space-y-2">
                <Label htmlFor="user-teams-toggle">User Teams Only</Label>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="user-teams-toggle"
                    checked={userTeamsOnly}
                    onCheckedChange={handleUserTeamsToggle}
                  />
                  <span className="text-sm text-gray-600">
                    {userTeamsOnly ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* Minimum Score Difference */}
              <div className="space-y-2">
                <Label htmlFor="min-score-diff">Min Score Difference</Label>
                <Input
                  id="min-score-diff"
                  type="number"
                  min="0"
                  value={minScoreDiff}
                  onChange={(e) => handleMinScoreDiffChange(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Debug Mode */}
            <div className="flex items-center space-x-2">
              <Switch
                id="debug-mode"
                checked={debugMode}
                onCheckedChange={setDebugMode}
              />
              <Label htmlFor="debug-mode">Debug Mode</Label>
            </div>
          </div>

          <Separator />

          {/* Quick Actions */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleSubscribeToSport('NFL')}
                disabled={!isConnected}
                variant="outline"
                size="sm"
              >
                Subscribe to NFL
              </Button>
              <Button
                onClick={() => handleSubscribeToSport('NBA')}
                disabled={!isConnected}
                variant="outline"
                size="sm"
              >
                Subscribe to NBA
              </Button>
              <Button onClick={clearUpdates} variant="outline" size="sm">
                <Trash2 className="w-3 h-3 mr-1" />
                Clear Updates
              </Button>
              <Button onClick={clearErrors} variant="outline" size="sm">
                <Trash2 className="w-3 h-3 mr-1" />
                Clear Errors
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Latest Update */}
      {latestUpdate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Latest Update
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{latestUpdate.sport}</Badge>
                <Badge variant={latestUpdate.isUserTeam ? 'default' : 'secondary'}>
                  {latestUpdate.isUserTeam ? 'User Team' : 'Other Team'}
                </Badge>
              </div>
              <p className="text-lg font-semibold">
                {latestUpdate.homeTeam} {latestUpdate.homeScore} - {latestUpdate.awayScore} {latestUpdate.awayTeam}
              </p>
              <p className="text-sm text-gray-600">
                Status: {latestUpdate.status} | Game ID: {latestUpdate.gameId}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(latestUpdate.timestamp).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Updates */}
      {recentUpdates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Updates ({recentUpdates.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {recentUpdates.slice(0, 10).map((update, index) => (
                <div key={`${update.gameId}-${update.timestamp}-${index}`} className="p-2 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{update.sport}</Badge>
                      <span className="text-sm font-medium">
                        {update.homeTeam} {update.homeScore} - {update.awayScore} {update.awayTeam}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(update.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-4 h-4" />
              Errors ({errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {errors.map((error, index) => (
                <div key={index} className="p-2 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge variant="destructive" className="text-xs mb-1">{error.type}</Badge>
                      <p className="text-sm text-red-800">{error.message}</p>
                    </div>
                    <span className="text-xs text-red-600">
                      {new Date(error.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Filters Display */}
      <Card>
        <CardHeader>
          <CardTitle>Current Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
            {JSON.stringify(currentFilters, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export default ScoreUpdatesTest;