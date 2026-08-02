"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type Ably from "ably";
type Message = Ably.Types.Message;
import { PlayerList } from "@/components/PlayerList";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Skeleton } from "@/components/Skeleton";
import { useAblyChannel } from "@/lib/useAblyChannel";
import type {
  Category,
  CategorySelectedEvent,
  Lobby,
  StoredSession,
} from "@/types";

interface LobbyPageProps {
  params: { roomCode: string };
}

export default function LobbyPage({ params }: LobbyPageProps) {
  const { roomCode } = params;
  const router = useRouter();

  const [session, setSession] = useState<StoredSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [joinUsername, setJoinUsername] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      }
    }
    setSessionChecked(true);
  }, [roomCode]);

  async function handleJoinViaLink() {
    if (!joinUsername.trim()) {
      setJoinError("Enter a username first");
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/lobby/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: joinUsername }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Could not join lobby");
      }
      const data = (await res.json()) as { playerId: string };
      const newSession: StoredSession = {
        username: joinUsername,
        playerId: data.playerId,
        roomCode,
      };
      localStorage.setItem("hol-session", JSON.stringify(newSession));
      setSession(newSession);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join lobby");
    } finally {
      setJoining(false);
    }
  }

  useEffect(() => {
    async function loadLobby() {
      const res = await fetch(`/api/lobby/${roomCode}`);
      if (!res.ok) {
        setError("Lobby not found");
        return;
      }
      const data = (await res.json()) as { lobby: Lobby };
      setLobby(data.lobby);
    }
    loadLobby();
  }, [roomCode]);

  useEffect(() => {
    async function loadCategories() {
      const res = await fetch("/api/categories");
      const data = (await res.json()) as { categories: Category[] };
      setCategories(data.categories);
    }
    loadCategories();
  }, []);

  useEffect(() => {
    if (!channel) return;

    const onPlayerJoined = () => {
      fetch(`/api/lobby/${roomCode}`)
        .then((res) => res.json())
        .then((data: { lobby: Lobby }) => setLobby(data.lobby));
    };

    const onCategorySelected = (msg: Message) => {
      const data = msg.data as CategorySelectedEvent;
      setLobby((prev) =>
        prev
          ? {
              ...prev,
              categoryId: data.categoryId,
              category: {
                id: data.categoryId,
                group: prev.category?.group ?? "",
                metric: data.metric,
                unit: data.unit,
                label: data.label,
              },
            }
          : prev
      );
    };

    const onGameStart = () => {
      if (session) router.push(`/game/${roomCode}`);
    };

    const onLobbyDeleted = () => {
      const raw = localStorage.getItem("hol-session");
      if (raw) {
        const stored = JSON.parse(raw) as StoredSession;
        if (stored.roomCode === roomCode) {
          localStorage.removeItem("hol-session");
        }
      }
      setError("The host deleted this room.");
    };

    channel.subscribe("player-joined", onPlayerJoined);
    channel.subscribe("category-selected", onCategorySelected);
    channel.subscribe("game-start", onGameStart);
    channel.subscribe("lobby-deleted", onLobbyDeleted);

    return () => {
      channel.unsubscribe("player-joined", onPlayerJoined);
      channel.unsubscribe("category-selected", onCategorySelected);
      channel.unsubscribe("game-start", onGameStart);
      channel.unsubscribe("lobby-deleted", onLobbyDeleted);
    };
  }, [channel, roomCode, router, session]);

  const currentPlayer = lobby?.players.find((p) => p.id === session?.playerId);
  const isHost = currentPlayer?.isHost ?? false;
  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/lobby/${roomCode}`
      : "";

  async function handleSelectCategory(category: Category) {
    await fetch(`/api/lobby/${roomCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select-category", categoryId: category.id }),
    });
  }

  async function handleStartGame() {
    const res = await fetch(`/api/lobby/${roomCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start-game" }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Could not start game");
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDeleteRoom() {
    if (!session) return;
    if (!window.confirm("Delete this room? This can't be undone and removes all players.")) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/lobby/${roomCode}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: session.playerId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not delete room");
        setDeleting(false);
        return;
      }
      localStorage.removeItem("hol-session");
      router.push("/");
    } catch {
      setError("Could not delete room");
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!lobby || !sessionChecked) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <Skeleton className="mb-6 h-24 w-full" />
        <Skeleton className="mb-6 h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!session) {
    if (lobby.status !== "waiting") {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-red-600">
            This game has already started — ask the host for a new invite once it finishes.
          </p>
        </div>
      );
    }

    if (lobby.players.length >= 8) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-red-600">This lobby is full (8/8 players).</p>
        </div>
      );
    }

    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-1 text-center text-2xl font-bold">Join Room {roomCode}</h1>
          <p className="mb-6 text-center text-gray-500">
            Enter a username to join this lobby.
          </p>
          <input
            className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            value={joinUsername}
            onChange={(e) => setJoinUsername(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            onKeyDown={(e) => e.key === "Enter" && handleJoinViaLink()}
          />
          <button
            onClick={handleJoinViaLink}
            disabled={joining}
            className="w-full rounded-lg bg-indigo-600 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {joining ? "Joining…" : "Join Lobby"}
          </button>
          {joinError && (
            <p className="mt-4 text-center text-sm text-red-600">{joinError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <ConnectionBanner connectionState={connectionState} />
      <div className="mb-6 rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-2 text-2xl font-bold">Room {roomCode}</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            readOnly
            value={inviteLink}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
          />
          <button
            onClick={handleCopyLink}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-semibold">
          Players ({lobby.players.length}/8)
        </h2>
        <PlayerList players={lobby.players} />
      </div>

      <div className="mb-6 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-semibold">Category</h2>
        {isHost ? (
          <CategoryPicker
            categories={categories}
            selectedCategoryId={lobby.categoryId}
            onSelect={handleSelectCategory}
          />
        ) : (
          <p className="text-gray-600">
            {lobby.category
              ? `${lobby.category.group} — ${lobby.category.metric}`
              : "Waiting for host to choose a category…"}
          </p>
        )}
      </div>

      {isHost && (
        <div className="flex flex-col gap-3">
          <button
            onClick={handleStartGame}
            disabled={!lobby.categoryId}
            className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Start Game
          </button>
          <button
            onClick={handleDeleteRoom}
            disabled={deleting}
            className="w-full rounded-lg border border-red-300 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete Room"}
          </button>
        </div>
      )}
    </div>
  );
}
