"use client";

import { useEffect, useRef, useState } from "react";
import Ably from "ably/promises";

export function useAblyChannel(
  channelName: string,
  clientId: string
): Ably.Types.RealtimeChannelPromise | null {
  const [channel, setChannel] = useState<Ably.Types.RealtimeChannelPromise | null>(null);
  const clientRef = useRef<Ably.Types.RealtimePromise | null>(null);

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
