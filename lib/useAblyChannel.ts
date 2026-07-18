"use client";

import { useEffect, useRef, useState } from "react";
import Ably from "ably";

export function useAblyChannel(
  channelName: string,
  clientId: string
): Ably.Types.RealtimeChannelCallbacks | null {
  const [channel, setChannel] = useState<Ably.Types.RealtimeChannelCallbacks | null>(null);
  const clientRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    const client = new Ably.Realtime({
      authUrl: `/api/ably/token?clientId=${encodeURIComponent(clientId)}`,
    });
    clientRef.current = client;
    const ch = client.channels.get(channelName);
    setChannel(ch);

    return () => {
      client.close();
    };
  }, [channelName, clientId]);

  return channel;
}
