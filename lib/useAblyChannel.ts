"use client";

import { useEffect, useRef, useState } from "react";
import Ably from "ably/promises";

export interface AblyChannelState {
  channel: Ably.Types.RealtimeChannelPromise | null;
  connectionState: Ably.Types.ConnectionState;
}

export function useAblyChannel(channelName: string, clientId: string): AblyChannelState {
  const [channel, setChannel] = useState<Ably.Types.RealtimeChannelPromise | null>(null);
  const [connectionState, setConnectionState] = useState<Ably.Types.ConnectionState>(
    "initialized"
  );
  const clientRef = useRef<Ably.Types.RealtimePromise | null>(null);

  useEffect(() => {
    const client = new Ably.Realtime({
      authUrl: `/api/ably/token?clientId=${encodeURIComponent(clientId)}`,
    });
    clientRef.current = client;
    setConnectionState(client.connection.state);
    client.connection.on((stateChange) => setConnectionState(stateChange.current));

    const ch = client.channels.get(channelName);
    setChannel(ch);

    return () => {
      client.close();
    };
  }, [channelName, clientId]);

  return { channel, connectionState };
}
