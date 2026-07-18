"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type Ably from "ably";
type Message = Ably.Types.Message;
import { useAblyChannel } from "@/lib/useAblyChannel";
import { seededRandom } from "@/lib/seededRandom";
import { ScoreboardStrip } from "@/components/ScoreboardStrip";
import { Timer } from "@/components/Timer";
import { ROUNDS_PER_GAME, ROUND_TIMER_SECONDS } from "@/lib/categories";
import type {
  Item,
  Lobby,
  ScoreUpdateEvent,
  StoredSession,
  TiebreakerResultEvent,
  TiebreakerStartEvent,
} from "@/types";

interface GamePageProps {
  params: { roomCode: string };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function GamePage({ params }: GamePageProps) {
  const { roomCode } = params;
  const router = useRouter();

  const [session, setSession] = useState<StoredSession | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [pairs, setPairs] = useState<[Item, Item][]>([]);
  const [round, setRound] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_TIMER_SECONDS);
  const [scores, setScores] = useState<Record<string, { username: string; score: number }>>({});
  const [phase, setPhase] = useState<"loading" | "playing" | "waiting" | "tiebreaker" | "done">(
    "loading"
  );
  const [tiebreaker, setTiebreaker] = useState<TiebreakerStartEvent | null>(null);

  const channel = useAblyChannel(`room:${roomCode}`, session?.playerId ?? "guest");
  const myScoreRef = useRef(0);
  const answeredRef = useRef(false);

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
    if (!session) return;

    async function load() {
      const lobbyRes = await fetch(`/api/lobby/${roomCode}`);
      const lobbyData = (await lobbyRes.json()) as { lobby: Lobby };
      setLobby(lobbyData.lobby);

      if (!lobbyData.lobby.categoryId) return;

      const itemsRes = await fetch(
        `/api/items?category=${lobbyData.lobby.categoryId}&all=true`
      );
      const itemsData = (await itemsRes.json()) as { items: Item[] };

      const rand = seededRandom(roomCode);
      const shuffled = shuffle(itemsData.items, rand);
      const builtPairs: [Item, Item][] = [];
      for (let i = 0; i < ROUNDS_PER_GAME; i++) {
        const a = shuffled[(i * 2) % shuffled.length];
        const b = shuffled[(i * 2 + 1) % shuffled.length];
        builtPairs.push([a, b]);
      }
      setPairs(builtPairs);

      const initialScores: Record<string, { username: string; score: number }> = {};
      for (const p of lobbyData.lobby.players) {
        initialScores[p.id] = { username: p.username, score: 0 };
      }
      setScores(initialScores);

      setPhase("playing");
    }
    load();
  }, [session, roomCode]);

  useEffect(() => {
    if (phase !== "playing" || revealed) return;
    if (secondsLeft <= 0) {
      handleAnswer(null);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft, revealed]);

  useEffect(() => {
    if (!channel) return;

    const onScoreUpdate = (msg: Message) => {
      const data = msg.data as ScoreUpdateEvent;
      setScores((prev) => ({
        ...prev,
        [data.playerId]: { username: data.username, score: data.score },
      }));
    };

    const onTiebreakerStart = (msg: Message) => {
      const data = msg.data as TiebreakerStartEvent;
      setTiebreaker(data);
      answeredRef.current = false;
      if (session && data.tiedPlayerIds.includes(session.playerId)) {
        setPhase("tiebreaker");
      } else {
        setPhase("waiting");
      }
    };

    const onTiebreakerResult = (msg: Message) => {
      const data = msg.data as TiebreakerResultEvent;
      if (!("stillTied" in data) || !data.stillTied) {
        setPhase("done");
        setTimeout(() => router.push(`/results/${roomCode}`), 1500);
      }
    };

    const onGameEnd = () => {
      router.push(`/results/${roomCode}`);
    };

    channel.subscribe("score-update", onScoreUpdate);
    channel.subscribe("tiebreaker-start", onTiebreakerStart);
    channel.subscribe("tiebreaker-result", onTiebreakerResult);
    channel.subscribe("game-end", onGameEnd);

    return () => {
      channel.unsubscribe("score-update", onScoreUpdate);
      channel.unsubscribe("tiebreaker-start", onTiebreakerStart);
      channel.unsubscribe("tiebreaker-result", onTiebreakerResult);
      channel.unsubscribe("game-end", onGameEnd);
    };
  }, [channel, session, roomCode, router]);

  async function handleAnswer(guess: "higher" | "lower" | null) {
    if (revealed || !session || !channel) return;
    const [itemA, itemB] = pairs[round];
    const correct =
      guess !== null &&
      ((guess === "higher" && itemB.value >= itemA.value) ||
        (guess === "lower" && itemB.value <= itemA.value));

    setRevealed(true);
    setLastCorrect(correct);

    if (correct) {
      myScoreRef.current += 1;
    }

    setScores((prev) => ({
      ...prev,
      [session.playerId]: { username: session.username, score: myScoreRef.current },
    }));

    const event: ScoreUpdateEvent = {
      playerId: session.playerId,
      username: session.username,
      score: myScoreRef.current,
    };
    await channel.publish("score-update", event);

    setTimeout(() => {
      if (round + 1 >= ROUNDS_PER_GAME) {
        finishGame();
      } else {
        setRound((r) => r + 1);
        setRevealed(false);
        setLastCorrect(null);
        setSecondsLeft(ROUND_TIMER_SECONDS);
      }
    }, 1500);
  }

  async function finishGame() {
    if (!session || !lobby || !channel) return;

    if (lobby.category) {
      await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: session.username,
          score: myScoreRef.current,
          categoryId: lobby.category.id,
        }),
      });
    }

    const isHost = lobby.players.find((p) => p.id === session.playerId)?.isHost ?? false;

    if (!isHost) {
      setPhase("waiting");
      return;
    }

    setTimeout(async () => {
      const entries = Object.entries(scores).map(([playerId, s]) => ({
        playerId,
        ...s,
      }));
      const topScore = Math.max(...entries.map((e) => e.score), 0);
      const tied = entries.filter((e) => e.score === topScore);

      if (tied.length > 1 && pairs.length > 0) {
        const rand = seededRandom(roomCode + "-tiebreak-0");
        const idx = Math.floor(rand() * pairs.length);
        const event: TiebreakerStartEvent = {
          tiedPlayerIds: tied.map((t) => t.playerId),
          question: { itemA: pairs[idx][0], itemB: pairs[idx][1] },
        };
        await channel.publish("tiebreaker-start", event);
      } else {
        await channel.publish("game-end", {});
      }
    }, 800);
  }

  async function handleTiebreakerAnswer(guess: "higher" | "lower") {
    if (!tiebreaker || !session || !channel || answeredRef.current) return;
    answeredRef.current = true;

    const { itemA, itemB } = tiebreaker.question;
    const correct =
      (guess === "higher" && itemB.value >= itemA.value) ||
      (guess === "lower" && itemB.value <= itemA.value);

    if (correct) {
      const result: TiebreakerResultEvent = { winnerId: session.playerId, username: session.username };
      await channel.publish("tiebreaker-result", result);
    }
  }

  if (!lobby || phase === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading game…</p>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-lg text-gray-600">Waiting for other players to finish…</p>
        <ScoreboardStrip
          scores={Object.entries(scores).map(([playerId, s]) => ({ playerId, ...s }))}
        />
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-gray-600">Game over! Redirecting to results…</p>
      </div>
    );
  }

  if (phase === "tiebreaker" && tiebreaker) {
    const { itemA, itemB } = tiebreaker.question;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-amber-50 px-4">
        <h2 className="text-2xl font-bold text-amber-700">⚡ Tiebreaker Round ⚡</h2>
        <div className="flex w-full max-w-2xl gap-4">
          <div className="flex-1 rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-lg font-semibold">{itemA.name}</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              {itemA.value.toLocaleString()} {itemA.unit}
            </p>
          </div>
          <div className="flex-1 rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-lg font-semibold">{itemB.name}</p>
            <p className="mt-2 text-3xl font-bold text-gray-400">?</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => handleTiebreakerAnswer("higher")}
            className="rounded-lg bg-amber-600 px-8 py-3 font-semibold text-white hover:bg-amber-700"
          >
            Higher
          </button>
          <button
            onClick={() => handleTiebreakerAnswer("lower")}
            className="rounded-lg bg-amber-600 px-8 py-3 font-semibold text-white hover:bg-amber-700"
          >
            Lower
          </button>
        </div>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">No category selected for this lobby.</p>
      </div>
    );
  }

  const [itemA, itemB] = pairs[round];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <ScoreboardStrip
        scores={Object.entries(scores).map(([playerId, s]) => ({ playerId, ...s }))}
      />

      <div>
        <p className="mb-1 text-center text-sm text-gray-500">
          Round {round + 1} / {ROUNDS_PER_GAME}
        </p>
        <Timer secondsLeft={secondsLeft} totalSeconds={ROUND_TIMER_SECONDS} />
      </div>

      {lobby.category && (
        <p className="text-center text-lg font-medium text-gray-700">
          {lobby.category.group} — {lobby.category.metric}
        </p>
      )}

      <div className="flex gap-4">
        <div className="flex-1 rounded-2xl bg-white p-6 text-center shadow">
          <p className="text-lg font-semibold">{itemA.name}</p>
          <p className="mt-2 text-3xl font-bold text-indigo-600">
            {itemA.value.toLocaleString()} {itemA.unit}
          </p>
        </div>
        <div className="relative flex-1 rounded-2xl bg-white p-6 text-center shadow">
          <p className="text-lg font-semibold">{itemB.name}</p>
          <p
            className={`mt-2 text-3xl font-bold ${
              revealed ? "text-indigo-600" : "text-gray-300"
            }`}
          >
            {revealed ? `${itemB.value.toLocaleString()} ${itemB.unit}` : "???"}
          </p>
          {revealed && (
            <div
              className={`absolute inset-0 flex items-center justify-center rounded-2xl text-5xl ${
                lastCorrect ? "bg-green-500/80" : "bg-red-500/80"
              }`}
            >
              {lastCorrect ? "✅" : "❌"}
            </div>
          )}
        </div>
      </div>

      {!revealed && (
        <div className="flex gap-4">
          <button
            onClick={() => handleAnswer("higher")}
            className="flex-1 rounded-lg bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700"
          >
            Higher
          </button>
          <button
            onClick={() => handleAnswer("lower")}
            className="flex-1 rounded-lg bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700"
          >
            Lower
          </button>
        </div>
      )}
    </div>
  );
}
