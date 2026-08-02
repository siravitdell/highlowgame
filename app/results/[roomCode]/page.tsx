"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type Ably from "ably";
type Message = Ably.Types.Message;
import { useAblyChannel } from "@/lib/useAblyChannel";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Skeleton } from "@/components/Skeleton";
import type { Lobby, PlayAgainEvent, Score, StoredSession } from "@/types";

interface ResultsPageProps {
  params: { roomCode: string };
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function ResultsPage({ params }: ResultsPageProps) {
  const { roomCode } = params;
  const router = useRouter();

  const [session, setSession] = useState<StoredSession | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [leaderboard, setLeaderboard] = useState<Score[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creatingLobby, setCreatingLobby] = useState(false);

  const { channel, connectionState } = useAblyChannel(
    `room:${roomCode}`,
    session?.playerId ?? "guest"
  );

  useEffect(() => {
    const raw = localStorage.getItem("hol-session");
    if (raw) {
      const stored = JSON.parse(raw) as StoredSession;
      if (stored.roomCode === roomCode) {
        setSession(stored);
        return;
      }
    }
    router.push("/");
  }, [roomCode, router]);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/lobby/${roomCode}`);
      if (!res.ok) {
        setError("Room not found");
        return;
      }
      const data = (await res.json()) as { lobby: Lobby };
      setLobby(data.lobby);

      if (data.lobby.categoryId) {
        const scoresRes = await fetch(
          `/api/scores?category=${data.lobby.categoryId}&limit=10`
        );
        const scoresData = (await scoresRes.json()) as { scores: Score[] };
        setLeaderboard(scoresData.scores);
      }
    }
    load();
  }, [roomCode]);

  useEffect(() => {
    if (!channel || !session) return;

    const onPlayAgain = async (msg: Message) => {
      const data = msg.data as PlayAgainEvent;
      if (data.roomCode === roomCode) return;

      const currentPlayer = lobby?.players.find((p) => p.id === session.playerId);
      if (currentPlayer?.isHost) return;

      const res = await fetch(`/api/lobby/${data.roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: session.username }),
      });
      if (!res.ok) return;
      const joinData = (await res.json()) as { playerId: string };

      const newSession: StoredSession = {
        username: session.username,
        playerId: joinData.playerId,
        roomCode: data.roomCode,
      };
      localStorage.setItem("hol-session", JSON.stringify(newSession));
      router.push(`/lobby/${data.roomCode}`);
    };

    channel.subscribe("play-again", onPlayAgain);
    return () => channel.unsubscribe("play-again", onPlayAgain);
  }, [channel, session, lobby, roomCode, router]);

  async function handlePlayAgain() {
    if (!session || !channel) return;
    setCreatingLobby(true);

    const res = await fetch("/api/lobby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: session.username }),
    });
    if (!res.ok) {
      setCreatingLobby(false);
      return;
    }
    const data = (await res.json()) as { roomCode: string; playerId: string };

    const newSession: StoredSession = {
      username: session.username,
      playerId: data.playerId,
      roomCode: data.roomCode,
    };
    localStorage.setItem("hol-session", JSON.stringify(newSession));

    const event: PlayAgainEvent = { roomCode: data.roomCode };
    await channel.publish("play-again", event);

    router.push(`/lobby/${data.roomCode}`);
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!lobby || !session) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <Skeleton className="mx-auto mb-8 h-8 w-48" />
        <Skeleton className="mb-6 h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const ranked = [...lobby.players].sort((a, b) => b.score - a.score);
  const podium = ranked.slice(0, 3);
  const isHost = lobby.players.find((p) => p.id === session.playerId)?.isHost ?? false;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <ConnectionBanner connectionState={connectionState} />
      <h1 className="mb-6 text-center text-3xl font-bold">🏁 Game Over</h1>

      {podium.length > 0 && (
        <div className="mb-8 flex items-end justify-center gap-2 sm:gap-4">
          {podium.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.3 }}
              className={`flex flex-col items-center rounded-2xl bg-white p-3 shadow sm:p-4 ${
                i === 0 ? "order-2 pb-8" : i === 1 ? "order-1" : "order-3"
              }`}
            >
              <span className="text-3xl">{MEDALS[i]}</span>
              <p className="mt-1 text-center font-semibold">
                {p.username}
                {lobby.tiebreakerWinnerId === p.id && " ⚡"}
              </p>
              <p className="text-indigo-600">{p.score} pts</p>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mb-6 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-semibold">Final Standings</h2>
        <ol className="space-y-2">
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2"
            >
              <span>
                #{i + 1} {p.username}
                {lobby.tiebreakerWinnerId === p.id && " ⚡"}
                {p.id === session.playerId && (
                  <span className="ml-1 text-xs text-gray-400">(you)</span>
                )}
              </span>
              <span className="font-semibold text-indigo-600">{p.score}</span>
            </li>
          ))}
        </ol>
      </div>

      {leaderboard.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">
            {lobby.category?.group} — {lobby.category?.metric} All-Time Leaderboard
          </h2>
          <ol className="space-y-1">
            {leaderboard.map((s, i) => (
              <li key={s.id} className="flex justify-between text-sm text-gray-600">
                <span>
                  #{i + 1} {s.playerName}
                </span>
                <span>{s.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {isHost && (
        <button
          onClick={handlePlayAgain}
          disabled={creatingLobby}
          className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {creatingLobby ? "Creating new lobby…" : "Play Again"}
        </button>
      )}
    </div>
  );
}
