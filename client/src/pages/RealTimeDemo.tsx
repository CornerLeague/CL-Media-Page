import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useRealTimeScoreUpdates } from '@/hooks/useRealTimeScoreUpdates';
import { useUserTeamScores } from '@/hooks/useUserTeamScores';
import { RealTimeUpdates } from '@/components/RealTimeUpdates';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Bell, 
  BellOff, 
  Volume2, 
  VolumeX,
  RefreshCw,
  Trash2,
  Users,
  TrendingUp
} from 'lucide-react';

const RealTimeDemo: React.FC = () => {
  const realTimeUpdates = useRealTimeScoreUpdates({
    sports: ['NFL', 'NBA', 'MLB', 'NHL'],
    enableNotifications: false,
    enableSoundAlerts: false,
    maxUpdateHistory: 20,
    updateThrottleMs: 1000,
  });

  const {
    isConnected,
    connectionState,
    updateHistory,
    updateStats,
    lastUpdate,
    connect,
    disconnect,
    subscribeToSport,
    unsubscribeFromSport,
    subscribeToAllUserTeams,
    unsubscribeFromAllUserTeams,
    enableNotifications,
    disableNotifications,
    enableSoundAlerts,
    disableSoundAlerts,
    clearUpdateHistory,
  } = realTimeUpdates;

  // Track notification states locally since they're not in the return interface
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(false);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = React.useState(false);

  const {
    data: userTeamScores,
    isLoading,
    error,
    isWebSocketConnected,
    webSocketState,
    lastScoreUpdate,
    subscribeToRealTimeUpdates,
    unsubscribeFromRealTimeUpdates,
  } = useUserTeamScores({
    sport: 'NFL', // Required parameter
    enableRealTimeUpdates: true,
  });

  const getConnectionStatusColor = (state: string) => {
    switch (state) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-red-500';
      case 'reconnecting': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Real-Time Score Updates Demo</h1>
          <p className="text-muted-foreground mt-2">
            Test and monitor live score updates, WebSocket connections, and notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getConnectionStatusColor(connectionState)}`} />
          <span className="text-sm font-medium capitalize">{connectionState}</span>
        </div>
      </div>

      {/* Connection Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Connection Controls
          </CardTitle>
          <CardDescription>
            Manage WebSocket connections and real-time update subscriptions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={connect}
              disabled={isConnected}
              variant={isConnected ? "secondary" : "default"}
              className="flex items-center gap-2"
            >
              <Wifi className="w-4 h-4" />
              Connect
            </Button>
            <Button
              onClick={disconnect}
              disabled={!isConnected}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <WifiOff className="w-4 h-4" />
              Disconnect
            </Button>
            <Button
              onClick={subscribeToAllUserTeams}
              disabled={!isConnected}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Subscribe All Teams
            </Button>
            <Button
              onClick={unsubscribeFromAllUserTeams}
              disabled={!isConnected}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Unsubscribe All
            </Button>
          </div>

          <Separator />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['NFL', 'NBA', 'MLB', 'NHL'].map((sport) => (
              <div key={sport} className="flex flex-col gap-2">
                <Label className="text-sm font-medium">{sport}</Label>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => subscribeToSport(sport as any)}
                    disabled={!isConnected}
                  >
                    Subscribe
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unsubscribeFromSport(sport as any)}
                    disabled={!isConnected}
                  >
                    Unsubscribe
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Settings</CardTitle>
          <CardDescription>
            Configure how you receive real-time update notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              <Label htmlFor="notifications">Browser Notifications</Label>
            </div>
            <div className="flex gap-2">
                  <Switch
                    id="notifications"
                    checked={notificationsEnabled}
                    onCheckedChange={(checked) => {
                      setNotificationsEnabled(checked);
                      if (checked) {
                        enableNotifications();
                      } else {
                        disableNotifications();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {soundAlertsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  <Label htmlFor="sound">Sound Alerts</Label>
                </div>
                <Switch
                  id="sound"
                  checked={soundAlertsEnabled}
                  onCheckedChange={(checked) => {
                    setSoundAlertsEnabled(checked);
                    if (checked) {
                      enableSoundAlerts();
                    } else {
                      disableSoundAlerts();
                    }
                  }}
                />
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Updates</p>
                <p className="text-2xl font-bold">{updateStats.totalUpdates}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Score Updates</p>
                <p className="text-2xl font-bold">{updateStats.scoreUpdates}</p>
              </div>
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status Changes</p>
                <p className="text-2xl font-bold">{updateStats.statusChanges}</p>
              </div>
              <RefreshCw className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Connected Since</p>
                <p className="text-sm font-bold">
                  {updateStats.connectedSince ? formatTimestamp(updateStats.connectedSince) : 'Not connected'}
                </p>
              </div>
              <Wifi className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Latest Update */}
      {lastUpdate && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Update</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Type</Label>
                <p className="font-medium">{lastUpdate.type}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Game ID</Label>
                <p className="font-medium">{lastUpdate.gameId}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Sport</Label>
                <Badge variant="outline">{lastUpdate.sport}</Badge>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Time</Label>
                <p className="font-medium">{formatTimestamp(lastUpdate.timestamp)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Update History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Update History</CardTitle>
            <CardDescription>
              Recent real-time updates ({updateHistory.length} total)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={clearUpdateHistory}
            className="flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear History
          </Button>
        </CardHeader>
        <CardContent>
          {updateHistory.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No updates received yet. Connect and subscribe to see real-time updates.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {updateHistory.slice().reverse().map((update, index) => (
                <div
                  key={`${update.gameId}-${update.timestamp}-${index}`}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={update.type === 'score-update' ? 'default' : 'secondary'}>
                      {update.type === 'score-update' ? 'Score Update' : 
                       update.type === 'status-change' ? 'Status Change' : 
                       'Subscription Change'}
                    </Badge>
                    {update.type === 'score-update' && update.data && (
                      <span className="font-medium">
                        {update.data.homeTeam} {update.data.homeScore} - {update.data.awayScore} {update.data.awayTeam}
                      </span>
                    )}
                    <Badge variant="outline">{update.sport}</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatTimestamp(update.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Team Scores Integration */}
      <Card>
        <CardHeader>
          <CardTitle>User Team Scores Integration</CardTitle>
          <CardDescription>
            Real-time updates integration with useUserTeamScores hook
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">WebSocket Connected</Label>
              <p className="font-medium">{isWebSocketConnected ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">WebSocket State</Label>
              <Badge variant="outline">{webSocketState}</Badge>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Loading</Label>
              <p className="font-medium">{isLoading ? 'Yes' : 'No'}</p>
            </div>
          </div>

          {lastScoreUpdate && (
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <Label className="text-sm font-medium text-green-800 dark:text-green-200">
                Last Score Update from useUserTeamScores
              </Label>
              <div className="text-sm text-green-700 dark:text-green-300 mt-1 space-y-1">
                <p>Team: {lastScoreUpdate.payload.teamName}</p>
                <p>Game: {lastScoreUpdate.payload.gameData.homeTeam} {lastScoreUpdate.payload.gameData.homeScore} - {lastScoreUpdate.payload.gameData.awayScore} {lastScoreUpdate.payload.gameData.awayTeam}</p>
                <p>Status: {lastScoreUpdate.payload.gameData.status}</p>
                <p>Time: {formatTimestamp(lastScoreUpdate.payload.timestamp)}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <Label className="text-sm font-medium text-red-800 dark:text-red-200">Error</Label>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error.message}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => subscribeToRealTimeUpdates()}
              disabled={!isConnected}
            >
              Subscribe Real-time Updates
            </Button>
            <Button
              variant="outline"
              onClick={() => unsubscribeFromRealTimeUpdates()}
              disabled={!isConnected}
            >
              Unsubscribe Real-time Updates
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Real-time Updates Component */}
      <Card>
        <CardHeader>
          <CardTitle>Real-Time Updates Component</CardTitle>
          <CardDescription>
            Live component showing real-time updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RealTimeUpdates />
        </CardContent>
      </Card>
    </div>
  );
};

export default RealTimeDemo;