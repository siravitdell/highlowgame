"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type Ably from "ably";
type Message = Ably.Types.Message;
import { useAblyChannel } from "@/lib/useAblyChannel";
import { seededRandom } from "@/lib/seededRandom";
import { ScoreboardStrip } from "@/components/ScoreboardStrip";
import { Timer } from "@/components/Timer";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Skeleton } from "@/components/Skeleton";
import { ROUNDS_PER_GAME, ROUND_TIMER_SECONDS, TIEBREAKER_TIMER_SECONDS } from "@/lib/categories";
import type {
  Item,
  Lobby,
  ScoreUpdateEvent,
  StoredSession,
  TiebreakerAnswerEvent,
  TiebreakerResultEvent,
  TiebreakerStartEvent,
} from "@/types";

interface GamePageProps {
  params: { roomCode: string };
}

function dedupeByValue(items: Item[]): Item[] {
  const seen = new Set<number>();
  const result: Item[] = [];
  for (const item of items) {
    if (seen.has(item.value)) continue;
    seen.add(item.value);
    result.push(item);
  }
  return result;
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

async function publishWithRetry(
  channel: Ably.Types.RealtimeChannelPromise,
  event: string,
  data: unknown,
  attempts = 4
) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await channel.publish(event, data);
      return true;
    } catch (err) {
      console.error(`Failed to publish "${event}" (attempt ${i}/${attempts}):`, err);
      if (i < attempts) await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
  return false;
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

  const { channel, connectionState } = useAblyChannel(
    `room:${roomCode}`,
    session?.playerId ?? "guest"
  );
  const myScoreRef = useRef(0);
  const scoresRef = useRef(scores);
  const itemsPoolRef = useRef<Item[]>([]);
  const tiebreakCursorRef = useRef(0);
  const gameResolvedRef = useRef(false);
  const tiebreakAnswersRef = useRef<Map<string, boolean>>(new Map());
  const tiebreakScoresRef = useRef<Map<string, number>>(new Map());
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

      // Items with equal values would make a round unanswerable-wrong
      // (both "higher" and "lower" satisfy >= / <=), so dedupe by value
      // before pairing — every pair is then guaranteed to have a real answer.
      const deduped = dedupeByValue(itemsData.items);
      const rand = seededRandom(roomCode);
      const shuffled = shuffle(deduped, rand);
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

  useEffect(() => {
    if (!isHost || phase !== "waiting" || tiebreaker) return;
    const poll = setInterval(() => checkCompletion(), 5000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, phase, tiebreaker, roomCode]);

  // Fallback for every client (not just host): if the game-end /
  // tiebreaker-result broadcast itself gets dropped, poll the DB
  // directly so we still navigate once the host has actually resolved
  // the game, instead of waiting forever for a message that never came.
  useEffect(() => {
    if (phase !== "waiting" && phase !== "tiebreaker") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/lobby/${roomCode}`);
        if (!res.ok) return;
        const data = (await res.json()) as { lobby: Lobby };
        if (data.lobby.status === "finished") {
          setPhase("done");
          router.push(`/results/${roomCode}`);
        }
      } catch (err) {
        console.error("Failed to poll lobby status:", err);
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [phase, roomCode, router]);

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
    publishWithRetry(channel, "tiebreaker-start", event);

    if (tiebreakTimeoutRef.current) clearTimeout(tiebreakTimeoutRef.current);
    tiebreakTimeoutRef.current = setTimeout(
      () => resolveTiebreaker(),
      (TIEBREAKER_TIMER_SECONDS + 2) * 1000
    );
  }

  async function markGameFinished(
    tiebreakerWinnerId?: string,
    scoreUpdates?: { playerId: string; score: number }[]
  ) {
    try {
      await fetch(`/api/lobby/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish-game", tiebreakerWinnerId, scoreUpdates }),
      });
    } catch (err) {
      console.error("Failed to mark game finished:", err);
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

    // Award a point to whoever answered correctly this round. If the
    // tied players answered differently, this diverges their scores
    // immediately and whoever's ahead wins; if they matched (both
    // right or both wrong), scores stay level and we go another round.
    for (const id of tiedIds) {
      if (tiebreakAnswersRef.current.get(id) === true) {
        tiebreakScoresRef.current.set(id, (tiebreakScoresRef.current.get(id) ?? 0) + 1);
      }
    }

    const topScore = Math.max(...tiedIds.map((id) => tiebreakScoresRef.current.get(id) ?? 0));
    const stillTiedIds = tiedIds.filter(
      (id) => (tiebreakScoresRef.current.get(id) ?? 0) === topScore
    );

    if (stillTiedIds.length === 1) {
      const winnerId = stillTiedIds[0];
      const username = lobby?.players.find((p) => p.id === winnerId)?.username ?? "";
      const result: TiebreakerResultEvent = { winnerId, username };
      const scoreUpdates = tiedIds.map((id) => ({
        playerId: id,
        score: tiebreakScoresRef.current.get(id) ?? 0,
      }));
      markGameFinished(winnerId, scoreUpdates).then(() =>
        publishWithRetry(channel, "tiebreaker-result", result)
      );
    } else {
      const result: TiebreakerResultEvent = { stillTied: true };
      publishWithRetry(channel, "tiebreaker-result", result);
      setTimeout(() => startTiebreakerRound(stillTiedIds), 1200);
    }
  }

  function decideOutcome(players: { id: string; score: number }[]) {
    if (!channel || gameResolvedRef.current) return;
    gameResolvedRef.current = true;

    const topScore = Math.max(...players.map((p) => p.score), 0);
    const tied = players.filter((p) => p.score === topScore);

    if (tied.length <= 1) {
      markGameFinished().then(() => publishSafe(channel, "game-end", {}));
    } else {
      tiebreakScoresRef.current = new Map(tied.map((p) => [p.id, p.score]));
      startTiebreakerRound(tied.map((t) => t.id));
    }
  }

  async function checkCompletion() {
    if (!isHost || gameResolvedRef.current) return;
    try {
      const res = await fetch(`/api/lobby/${roomCode}`);
      if (!res.ok) return;
      const data = (await res.json()) as { lobby: Lobby };
      if (data.lobby.players.every((p) => p.finishedAt)) {
        decideOutcome(data.lobby.players);
      }
    } catch (err) {
      console.error("Failed to check game completion:", err);
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

    const onPlayerFinished = () => {
      checkCompletion();
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

    const onLobbyDeleted = () => {
      localStorage.removeItem("hol-session");
      router.push("/");
    };

    channel.subscribe("score-update", onScoreUpdate);
    channel.subscribe("player-finished", onPlayerFinished);
    channel.subscribe("tiebreaker-start", onTiebreakerStart);
    channel.subscribe("tiebreaker-answer", onTiebreakerAnswer);
    channel.subscribe("tiebreaker-result", onTiebreakerResult);
    channel.subscribe("game-end", onGameEnd);
    channel.subscribe("lobby-deleted", onLobbyDeleted);

    return () => {
      channel.unsubscribe("score-update", onScoreUpdate);
      channel.unsubscribe("player-finished", onPlayerFinished);
      channel.unsubscribe("tiebreaker-start", onTiebreakerStart);
      channel.unsubscribe("tiebreaker-answer", onTiebreakerAnswer);
      channel.unsubscribe("tiebreaker-result", onTiebreakerResult);
      channel.unsubscribe("game-end", onGameEnd);
      channel.unsubscribe("lobby-deleted", onLobbyDeleted);
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

  async function markMyselfFinished(attempt = 1): Promise<boolean> {
    if (!session) return false;
    try {
      const res = await fetch(`/api/lobby/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "player-finished",
          playerId: session.playerId,
          score: myScoreRef.current,
        }),
      });
      if (res.ok) return true;
    } catch (err) {
      console.error("Failed to mark player finished:", err);
    }
    if (attempt >= 3) return false;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    return markMyselfFinished(attempt + 1);
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

    // The DB write is the source of truth for completion; the pub/sub
    // publish below is just a low-latency hint to wake the host up sooner
    // (checkCompletion is also polled as a fallback if this is dropped).
    await markMyselfFinished();
    await publishSafe(channel, "player-finished", { playerId: session.playerId });
    checkCompletion();
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
    await publishWithRetry(channel, "tiebreaker-answer", event);
  }

  if (!lobby || phase === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-4 w-full" />
        <div className="flex flex-col gap-4 sm:flex-row">
          <Skeleton className="h-40 flex-1" />
          <Skeleton className="h-40 flex-1" />
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <ConnectionBanner connectionState={connectionState} />
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
      <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-amber-50 px-4 py-8">
        <ConnectionBanner connectionState={connectionState} />
        <h2 className="text-2xl font-bold text-amber-700">⚡ Tiebreaker Round ⚡</h2>
        <Timer secondsLeft={tiebreakSecondsLeft} totalSeconds={TIEBREAKER_TIMER_SECONDS} />
        <div className="flex w-full max-w-2xl flex-col gap-4 sm:flex-row">
          <div className="flex-1 rounded-2xl bg-white p-4 text-center shadow sm:p-6">
            <p className="text-lg font-semibold">{itemA.name}</p>
            <p className="mt-2 text-2xl font-bold text-amber-600 sm:text-3xl">
              {itemA.value.toLocaleString()} {itemA.unit}
            </p>
          </div>
          <div className="flex-1 rounded-2xl bg-white p-4 text-center shadow sm:p-6">
            <p className="text-lg font-semibold">{itemB.name}</p>
            <p className="mt-2 text-2xl font-bold text-gray-400 sm:text-3xl">?</p>
          </div>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:gap-4">
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
      <ConnectionBanner connectionState={connectionState} />
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

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1 rounded-2xl bg-white p-4 text-center shadow sm:p-6">
          <p className="text-lg font-semibold">{itemA.name}</p>
          <p className="mt-2 text-2xl font-bold text-indigo-600 sm:text-3xl">
            {itemA.value.toLocaleString()} {itemA.unit}
          </p>
        </div>
        <div className="relative flex-1 overflow-hidden rounded-2xl bg-white p-4 text-center shadow sm:p-6">
          <p className="text-lg font-semibold">{itemB.name}</p>
          <motion.p
            key={revealed ? "revealed" : "hidden"}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className={`mt-2 text-2xl font-bold sm:text-3xl ${
              revealed ? "text-indigo-600" : "text-gray-300"
            }`}
          >
            {revealed ? `${itemB.value.toLocaleString()} ${itemB.unit}` : "???"}
          </motion.p>
          <AnimatePresence>
            {revealed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`absolute inset-0 flex items-center justify-center rounded-2xl text-5xl ${
                  lastCorrect ? "bg-green-500/80" : "bg-red-500/80"
                }`}
              >
                {lastCorrect ? "✅" : "❌"}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {!revealed && (
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
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
