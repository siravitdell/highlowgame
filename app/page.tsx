"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StoredSession } from "@/types";

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateLobby() {
    if (!username.trim()) {
      setError("Enter a username first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error("Failed to create lobby");
      const data = (await res.json()) as { roomCode: string; playerId: string };

      const session: StoredSession = {
        username,
        playerId: data.playerId,
        roomCode: data.roomCode,
      };
      localStorage.setItem("hol-session", JSON.stringify(session));

      router.push(`/lobby/${data.roomCode}`);
    } catch {
      setError("Could not create lobby. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinLobby() {
    if (!username.trim() || !joinCode.trim()) {
      setError("Enter a username and room code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const roomCode = joinCode.trim().toUpperCase();
      const res = await fetch(`/api/lobby/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to join lobby");
      }
      const data = (await res.json()) as { playerId: string };

      const session: StoredSession = {
        username,
        playerId: data.playerId,
        roomCode,
      };
      localStorage.setItem("hol-session", JSON.stringify(session));

      router.push(`/lobby/${roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join lobby.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-center text-3xl font-bold">Higher or Lower</h1>
        <p className="mb-6 text-center text-gray-500">
          Compare countries, cities, mountains, planets, and more.
        </p>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          Username
        </label>
        <input
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Your name"
          maxLength={20}
        />

        <button
          onClick={handleCreateLobby}
          disabled={loading}
          className="mb-4 w-full rounded-lg bg-indigo-600 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          Create Lobby
        </button>

        <div className="mb-4 flex items-center gap-2 text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs">OR</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          Room Code
        </label>
        <input
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 uppercase focus:border-indigo-500 focus:outline-none"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="AB12CD"
          maxLength={6}
        />

        <button
          onClick={handleJoinLobby}
          disabled={loading}
          className="w-full rounded-lg border border-indigo-600 py-2 font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
        >
          Join with Code
        </button>

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
