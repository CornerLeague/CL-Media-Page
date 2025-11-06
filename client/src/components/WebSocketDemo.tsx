import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { WebSocketStatus } from '@/components/WebSocketStatus';
import type { 
  UserTeamScoreUpdate, 
  UserTeamStatusChange, 
  SubscriptionConfirmation,
  ConnectionStatus,
  UserTeamsLoaded 
} from '@/hooks/useWebSocket';

export function WebSocketDemo() {
  const { 
    connectionState, 
    isConnected, 
    metrics, 
    connect, 
    disconnect, 
    subscribe, 
    unsubscribe,
    sendMessage 
  } = useWebSocketContext();

  const [teamId, setTeamId] = useState('');
  const [subscribedTeams, setSubscribedTeams] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Array<{ timestamp: Date; type: string; data: any }>>([]);

  // Event handlers
  useEffect(() => {
    const handleScoreUpdate = (data: UserTeamScoreUpdate) => {
      setMessages(prev => [...prev, { 
        timestamp: new Date(), 
        type: 'Score Update', 
        data 
      }]);
    };

    const handleStatusChange = (data: UserTeamStatusChange) => {
      setMessages(prev => [...prev, { 
        timestamp: new Date(), 
        type: 'Status Change', 
        data 
      }]);
    };

    const handleSubscriptionConfirmation = (data: SubscriptionConfirmation) => {
      setMessages(prev => [...prev, { 
        timestamp: new Date(), 
        type: 'Subscription Confirmed', 
        data 
      }]);
    };

    const handleConnectionStatus = (data: ConnectionStatus) => {
      setMessages(prev => [...prev, { 
        timestamp: new Date(), 
        type: 'Connection Status', 
        data 
      }]);
    };

    const handleUserTeamsLoaded = (data: UserTeamsLoaded) => {
      setMessages(prev => [...prev, { 
        timestamp: new Date(), 
        type: 'User Teams Loaded', 
        data 
      }]);
    };

    // Subscribe to events
    subscribe('user-team-score-update', handleScoreUpdate);
    subscribe('user-team-status-change', handleStatusChange);
    subscribe('subscription-confirmation', handleSubscriptionConfirmation);
    subscribe('connection-status', handleConnectionStatus);
    subscribe('user-teams-loaded', handleUserTeamsLoaded);

    return () => {
      // Unsubscribe from events
      unsubscribe('user-team-score-update', handleScoreUpdate);
      unsubscribe('user-team-status-change', handleStatusChange);
      unsubscribe('subscription-confirmation', handleSubscriptionConfirmation);
      unsubscribe('connection-status', handleConnectionStatus);
      unsubscribe('user-teams-loaded', handleUserTeamsLoaded);
    };
  }, [subscribe, unsubscribe]);

  const handleSubscribeToTeam = () => {
    if (teamId.trim()) {
      sendMessage({
        type: 'subscribe-to-team',
        teamId: teamId.trim()
      });
      setSubscribedTeams(prev => new Set([...prev, teamId.trim()]));
      setTeamId('');
    }
  };

  const handleUnsubscribeFromTeam = (teamIdToRemove: string) => {
    sendMessage({
      type: 'unsubscribe-from-team',
      teamId: teamIdToRemove
    });
    setSubscribedTeams(prev => {
      const newSet = new Set(prev);
      newSet.delete(teamIdToRemove);
      return newSet;
    });
  };

  const handleSubscribeToUserTeams = () => {
    sendMessage({
      type: 'subscribe-to-user-teams'
    });
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>WebSocket Demo</CardTitle>
          <CardDescription>
            Test and monitor WebSocket connections and real-time updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Status */}
          <WebSocketStatus />

          <Separator />

          {/* Connection Controls */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Connection Controls</h3>
            <div className="flex gap-2">
              <Button 
                onClick={connect} 
                disabled={isConnected}
                variant="default"
              >
                Connect
              </Button>
              <Button 
                onClick={disconnect} 
                disabled={!isConnected}
                variant="outline"
              >
                Disconnect
              </Button>
            </div>
          </div>

          <Separator />

          {/* Team Subscriptions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Team Subscriptions</h3>
            
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="teamId">Team ID</Label>
                <Input
                  id="teamId"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  placeholder="Enter team ID"
                  onKeyPress={(e) => e.key === 'Enter' && handleSubscribeToTeam()}
                />
              </div>
              <Button 
                onClick={handleSubscribeToTeam}
                disabled={!isConnected || !teamId.trim()}
                className="mt-6"
              >
                Subscribe
              </Button>
            </div>

            <Button 
              onClick={handleSubscribeToUserTeams}
              disabled={!isConnected}
              variant="outline"
            >
              Subscribe to My Teams
            </Button>

            {subscribedTeams.size > 0 && (
              <div>
                <Label>Subscribed Teams:</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Array.from(subscribedTeams).map(teamId => (
                    <Badge 
                      key={teamId} 
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => handleUnsubscribeFromTeam(teamId)}
                    >
                      {teamId} ✕
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Message Log */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Message Log</h3>
              <Button 
                onClick={clearMessages}
                variant="outline"
                size="sm"
              >
                Clear
              </Button>
            </div>

            <div className="max-h-96 overflow-y-auto border rounded-lg p-4 space-y-2">
              {messages.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No messages received yet
                </p>
              ) : (
                messages.slice(-20).reverse().map((message, index) => (
                  <div 
                    key={index} 
                    className="border-b pb-2 last:border-b-0"
                  >
                    <div className="flex justify-between items-start">
                      <Badge variant="outline" className="mb-1">
                        {message.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(message.data, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.messagesReceived}</div>
              <div className="text-sm text-muted-foreground">Messages Received</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.messagesSent}</div>
              <div className="text-sm text-muted-foreground">Messages Sent</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.reconnectAttempts}</div>
              <div className="text-sm text-muted-foreground">Reconnect Attempts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {metrics.uptime ? Math.floor(metrics.uptime / 1000) : 0}s
              </div>
              <div className="text-sm text-muted-foreground">Uptime</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}