"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type Ably from "ably";
type Message = Ably.Types.Message;
import { useAblyChannel } from "@/lib/useAblyChannel";
import { seededRandom } from "@/lib/seededRandom";
import { ScoreboardStrip } from "@/components/ScoreboardStrip";
import { Timer } from "@/components/Timer";
import { ROUNDS_PER_GAME, ROUND_TIMER_SECONDS, TIEBREAKER_TIMER_SECONDS } from "@/lib/categories";
import type {
  Item,
  Lobby,
  PlayerFinishedEvent,
  ScoreUpdateEvent,
  StoredSession,
  TiebreakerAnswerEvent,
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

async function publishSafe(
  channel: Ably.Types.RealtimeChannelPromise,
  event: string,
  data: unknown
) {
  try {
    await channel.publish(event, data);
  } catch (err) {
    console.error(`Failed to publish "${event}":`, err);
  }
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
  const [phase, setPhase] = useState<
    "loading" | "playing" | "waiting" | "tiebreaker" | "done"
  >("loading");
  const [tiebreaker, setTiebreaker] = useState<TiebreakerStartEvent | null>(null);
  const [tiebreakAnswered, setTiebreakAnswered] = useState(false);
  const [tiebreakSecondsLeft, setTiebreakSecondsLeft] = useState(TIEBREAKER_TIMER_SECONDS);

  const channel = useAblyChannel(`room:${roomCode}`, session?.playerId ?? "guest");
  const myScoreRef = useRef(0);
  const scoresRef = useRef(scores);
  const itemsPoolRef = useRef<Item[]>([]);
  const tiebreakCursorRef = useRef(0);
  const finishedPlayersRef = useRef<Set<string>>(new Set());
  const gameResolvedRef = useRef(false);
  const tiebreakAnswersRef = useRef<Map<string, boolean>>(new Map());
  const tiebreakTiedIdsRef = useRef<string[]>([]);
  const tiebreakResolvedRef = useRef(true);
  const tiebreakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiebreakAnsweredRef = useRef(false);

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  const isHost = useMemo(
    () => lobby?.players.find((p) => p.id === session?.playerId)?.isHost ?? false,
    [lobby, session]
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
      itemsPoolRef.current = shuffled;

      const builtPairs: [Item, Item][] = [];
      for (let i = 0; i < ROUNDS_PER_GAME; i++) {
        const a = shuffled[(i * 2) % shuffled.length];
        const b = shuffled[(i * 2 + 1) % shuffled.length];
        builtPairs.push([a, b]);
      }
      setPairs(builtPairs);
      tiebreakCursorRef.current = ROUNDS_PER_GAME * 2;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft, revealed]);

  useEffect(() => {
    if (phase !== "tiebreaker" || tiebreakAnswered) return;
    if (tiebreakSecondsLeft <= 0) {
      handleTiebreakerAnswer(null);
      return;
    }
    const t = setTimeout(() => setTiebreakSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tiebreakSecondsLeft, tiebreakAnswered]);

  function getNextTiebreakPair(): [Item, Item] {
    const pool = itemsPoolRef.current;
    const i = tiebreakCursorRef.current;
    const a = pool[i % pool.length];
    const b = pool[(i + 1) % pool.length];
    tiebreakCursorRef.current += 2;
    return [a, b];
  }

  function startTiebreakerRound(tiedPlayerIds: string[]) {
    if (!channel) return;
    tiebreakAnswersRef.current = new Map();
    tiebreakTiedIdsRef.current = tiedPlayerIds;
    tiebreakResolvedRef.current = false;

    const [itemA, itemB] = getNextTiebreakPair();
    const event: TiebreakerStartEvent = {
      tiedPlayerIds,
      question: { itemA, itemB },
    };
    publishSafe(channel, "tiebreaker-start", event);

    if (tiebreakTimeoutRef.current) clearTimeout(tiebreakTimeoutRef.current);
    tiebreakTimeoutRef.current = setTimeout(
      () => resolveTiebreaker(),
      (TIEBREAKER_TIMER_SECONDS + 2) * 1000
    );
  }

  async function persistFinalResults(tiebreakerWinnerId?: string) {
    if (!lobby) return;
    try {
      await fetch(`/api/lobby/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finish-game",
          results: lobby.players.map((p) => ({
            playerId: p.id,
            score: scoresRef.current[p.id]?.score ?? 0,
          })),
          tiebreakerWinnerId,
        }),
      });
    } catch (err) {
      console.error("Failed to persist final results:", err);
    }
  }

  function resolveTiebreaker() {
    if (!channel || tiebreakResolvedRef.current) return;
    tiebreakResolvedRef.current = true;
    if (tiebreakTimeoutRef.current) {
      clearTimeout(tiebreakTimeoutRef.current);
      tiebreakTimeoutRef.current = null;
    }

    const tiedIds = tiebreakTiedIdsRef.current;
    const correctPlayers = tiedIds.filter((id) => tiebreakAnswersRef.current.get(id) === true);

    if (correctPlayers.length === 1) {
      const winnerId = correctPlayers[0];
      const username = lobby?.players.find((p) => p.id === winnerId)?.username ?? "";
      const result: TiebreakerResultEvent = { winnerId, username };
      persistFinalResults(winnerId).then(() => publishSafe(channel, "tiebreaker-result", result));
    } else {
      const result: TiebreakerResultEvent = { stillTied: true };
      publishSafe(channel, "tiebreaker-result", result);
      setTimeout(() => startTiebreakerRound(tiedIds), 1200);
    }
  }

  function decideOutcome() {
    if (!channel || !lobby || gameResolvedRef.current) return;
    gameResolvedRef.current = true;

    const entries = lobby.players.map((p) => ({
      playerId: p.id,
      score: scoresRef.current[p.id]?.score ?? 0,
    }));
    const topScore = Math.max(...entries.map((e) => e.score), 0);
    const tied = entries.filter((e) => e.score === topScore);

    if (tied.length <= 1) {
      persistFinalResults().then(() => publishSafe(channel, "game-end", {}));
    } else {
      startTiebreakerRound(tied.map((t) => t.playerId));
    }
  }

  useEffect(() => {
    if (!channel || !lobby) return;

    const onScoreUpdate = (msg: Message) => {
      const data = msg.data as ScoreUpdateEvent;
      setScores((prev) => ({
        ...prev,
        [data.playerId]: { username: data.username, score: data.score },
      }));
    };

    const onPlayerFinished = (msg: Message) => {
      const data = msg.data as PlayerFinishedEvent;
      finishedPlayersRef.current.add(data.playerId);
      if (isHost && finishedPlayersRef.current.size >= lobby.players.length) {
        decideOutcome();
      }
    };

    const onTiebreakerStart = (msg: Message) => {
      const data = msg.data as TiebreakerStartEvent;
      setTiebreaker(data);
      tiebreakTiedIdsRef.current = data.tiedPlayerIds;
      tiebreakAnsweredRef.current = false;
      setTiebreakAnswered(false);
      setTiebreakSecondsLeft(TIEBREAKER_TIMER_SECONDS);
      if (session && data.tiedPlayerIds.includes(session.playerId)) {
        setPhase("tiebreaker");
      } else {
        setPhase("waiting");
      }
    };

    const onTiebreakerAnswer = (msg: Message) => {
      const data = msg.data as TiebreakerAnswerEvent;
      tiebreakAnswersRef.current.set(data.playerId, data.correct);
      const tiedIds = tiebreakTiedIdsRef.current;
      if (isHost && tiedIds.length > 0 && tiedIds.every((id) => tiebreakAnswersRef.current.has(id))) {
        resolveTiebreaker();
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
      setPhase("done");
      router.push(`/results/${roomCode}`);
    };

    channel.subscribe("score-update", onScoreUpdate);
    channel.subscribe("player-finished", onPlayerFinished);
    channel.subscribe("tiebreaker-start", onTiebreakerStart);
    channel.subscribe("tiebreaker-answer", onTiebreakerAnswer);
    channel.subscribe("tiebreaker-result", onTiebreakerResult);
    channel.subscribe("game-end", onGameEnd);

    return () => {
      channel.unsubscribe("score-update", onScoreUpdate);
      channel.unsubscribe("player-finished", onPlayerFinished);
      channel.unsubscribe("tiebreaker-start", onTiebreakerStart);
      channel.unsubscribe("tiebreaker-answer", onTiebreakerAnswer);
      channel.unsubscribe("tiebreaker-result", onTiebreakerResult);
      channel.unsubscribe("game-end", onGameEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, lobby, session, roomCode, router, isHost]);

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
    await publishSafe(channel, "score-update", event);

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
      try {
        await fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerName: session.username,
            score: myScoreRef.current,
            categoryId: lobby.category.id,
          }),
        });
      } catch (err) {
        console.error("Failed to save score:", err);
      }
    }

    await publishSafe(channel, "player-finished", { playerId: session.playerId });
    setPhase("waiting");
  }

  async function handleTiebreakerAnswer(guess: "higher" | "lower" | null) {
    if (!tiebreaker || !session || !channel || tiebreakAnsweredRef.current) return;
    tiebreakAnsweredRef.current = true;
    setTiebreakAnswered(true);

    const { itemA, itemB } = tiebreaker.question;
    const correct =
      guess !== null &&
      ((guess === "higher" && itemB.value >= itemA.value) ||
        (guess === "lower" && itemB.value <= itemA.value));

    const event: TiebreakerAnswerEvent = { playerId: session.playerId, correct };
    await publishSafe(channel, "tiebreaker-answer", event);
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
        <p className="text-lg text-gray-600">
          {tiebreaker ? "Waiting for tiebreaker…" : "Waiting for other players to finish…"}
        </p>
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
        <Timer secondsLeft={tiebreakSecondsLeft} totalSeconds={TIEBREAKER_TIMER_SECONDS} />
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
            disabled={tiebreakAnswered}
            className="rounded-lg bg-amber-600 px-8 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Higher
          </button>
          <button
            onClick={() => handleTiebreakerAnswer("lower")}
            disabled={tiebreakAnswered}
            className="rounded-lg bg-amber-600 px-8 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Lower
          </button>
        </div>
        {tiebreakAnswered && (
          <p className="text-sm text-amber-700">Answer locked in — waiting for other players…</p>
        )}
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
