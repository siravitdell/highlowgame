import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAblyRest } from "@/lib/ably";
import type Ably from "ably";
import type { CategorySelectedEvent, PlayerJoinedEvent } from "@/types";

export const dynamic = "force-dynamic";

const MAX_PLAYERS = 8;

async function publishBestEffort(
  channel: Ably.Types.ChannelPromise,
  event: string,
  data: unknown
) {
  try {
    await channel.publish(event, data);
  } catch (err) {
    console.error(`Failed to publish "${event}" to ${channel.name}:`, err);
  }
}

interface JoinLobbyBody {
  username: string;
}

function isJoinLobbyBody(value: unknown): value is JoinLobbyBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return typeof body.username === "string";
}

interface FinishGameResult {
  playerId: string;
  score: number;
}

interface UpdateLobbyBody {
  action: "select-category" | "start-game" | "finish-game";
  categoryId?: string;
  results?: FinishGameResult[];
  tiebreakerWinnerId?: string;
}

function isUpdateLobbyBody(value: unknown): value is UpdateLobbyBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    body.action === "select-category" ||
    body.action === "start-game" ||
    body.action === "finish-game"
  );
}

function isFinishGameResults(value: unknown): value is FinishGameResult[] {
  return (
    Array.isArray(value) &&
    value.every(
      (r) =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as Record<string, unknown>).playerId === "string" &&
        typeof (r as Record<string, unknown>).score === "number"
    )
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;

  const lobby = await prisma.lobby.findUnique({
    where: { roomCode },
    include: { players: true, category: true },
  });

  if (!lobby) {
    return NextResponse.json({ error: "lobby not found" }, { status: 404 });
  }

  return NextResponse.json({ lobby });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;
  const body: unknown = await request.json();

  if (!isJoinLobbyBody(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const lobby = await prisma.lobby.findUnique({
    where: { roomCode },
    include: { players: true },
  });

  if (!lobby) {
    return NextResponse.json({ error: "lobby not found" }, { status: 404 });
  }

  if (lobby.status !== "waiting") {
    return NextResponse.json({ error: "game already started" }, { status: 409 });
  }

  if (lobby.players.length >= MAX_PLAYERS) {
    return NextResponse.json({ error: "lobby is full" }, { status: 409 });
  }

  const player = await prisma.player.create({
    data: {
      username: body.username,
      lobbyId: lobby.id,
    },
  });

  const event: PlayerJoinedEvent = {
    username: player.username,
    playerCount: lobby.players.length + 1,
  };

  const ably = getAblyRest();
  const channel = ably.channels.get(`room:${roomCode}`);
  await publishBestEffort(channel, "player-joined", event);

  return NextResponse.json({ playerId: player.id }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;
  const body: unknown = await request.json();

  if (!isUpdateLobbyBody(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const lobby = await prisma.lobby.findUnique({ where: { roomCode } });
  if (!lobby) {
    return NextResponse.json({ error: "lobby not found" }, { status: 404 });
  }

  const ably = getAblyRest();
  const channel = ably.channels.get(`room:${roomCode}`);

  if (body.action === "select-category") {
    if (!body.categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!category) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }

    await prisma.lobby.update({
      where: { id: lobby.id },
      data: { categoryId: category.id },
    });

    const event: CategorySelectedEvent = {
      categoryId: category.id,
      label: category.label,
      metric: category.metric,
      unit: category.unit,
    };
    await publishBestEffort(channel, "category-selected", event);

    return NextResponse.json({ category });
  }

  if (body.action === "start-game") {
    if (!lobby.categoryId) {
      return NextResponse.json({ error: "no category selected" }, { status: 400 });
    }

    await prisma.lobby.update({
      where: { id: lobby.id },
      data: { status: "playing" },
    });

    await publishBestEffort(channel, "game-start", {});

    return NextResponse.json({ status: "playing" });
  }

  if (body.action === "finish-game") {
    if (!isFinishGameResults(body.results)) {
      return NextResponse.json({ error: "results are required" }, { status: 400 });
    }

    await prisma.$transaction([
      ...body.results.map((r) =>
        prisma.player.update({ where: { id: r.playerId }, data: { score: r.score } })
      ),
      prisma.lobby.update({
        where: { id: lobby.id },
        data: {
          status: "finished",
          tiebreakerWinnerId: body.tiebreakerWinnerId ?? null,
        },
      }),
    ]);

    return NextResponse.json({ status: "finished" });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
