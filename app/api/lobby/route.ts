import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRoomCode } from "@/lib/roomCode";

export const dynamic = "force-dynamic";

interface CreateLobbyBody {
  username: string;
  categoryId?: string;
}

function isCreateLobbyBody(value: unknown): value is CreateLobbyBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.username === "string" &&
    (body.categoryId === undefined || typeof body.categoryId === "string")
  );
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  if (!isCreateLobbyBody(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let roomCode = generateRoomCode();
  while (await prisma.lobby.findUnique({ where: { roomCode } })) {
    roomCode = generateRoomCode();
  }

  const lobby = await prisma.lobby.create({
    data: {
      roomCode,
      hostId: "",
      categoryId: body.categoryId,
    },
  });

  const player = await prisma.player.create({
    data: {
      username: body.username,
      lobbyId: lobby.id,
      isHost: true,
    },
  });

  await prisma.lobby.update({
    where: { id: lobby.id },
    data: { hostId: player.id },
  });

  return NextResponse.json({ roomCode, playerId: player.id }, { status: 201 });
}
