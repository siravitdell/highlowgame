"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type Ably from "ably";
type Message = Ably.Types.Message;
import { PlayerList } from "@/components/PlayerList";
import { CategoryPicker } from "@/components/CategoryPicker";
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
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channel = useAblyChannel(`room:${roomCode}`, session?.playerId ?? "guest");

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
      router.push(`/game/${roomCode}`);
    };

    channel.subscribe("player-joined", onPlayerJoined);
    channel.subscribe("category-selected", onCategorySelected);
    channel.subscribe("game-start", onGameStart);

    return () => {
      channel.unsubscribe("player-joined", onPlayerJoined);
      channel.unsubscribe("category-selected", onCategorySelected);
      channel.unsubscribe("game-start", onGameStart);
    };
  }, [channel, roomCode, router]);

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

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading lobby…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-2 text-2xl font-bold">Room {roomCode}</h1>
        <div className="flex items-center gap-2">
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
        <button
          onClick={handleStartGame}
          disabled={!lobby.categoryId}
          className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Start Game
        </button>
      )}
    </div>
  );
}
