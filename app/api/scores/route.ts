import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface CreateScoreBody {
  playerName: string;
  score: number;
  categoryId: string;
}

function isCreateScoreBody(value: unknown): value is CreateScoreBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.playerName === "string" &&
    typeof body.score === "number" &&
    typeof body.categoryId === "string"
  );
}

export async function GET(request: NextRequest) {
  const categoryId = request.nextUrl.searchParams.get("category");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 10;

  if (!categoryId) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  const scores = await prisma.score.findMany({
    where: { categoryId },
    orderBy: { score: "desc" },
    take: limit,
  });

  return NextResponse.json({ scores });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  if (!isCreateScoreBody(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const score = await prisma.score.create({
    data: {
      playerName: body.playerName,
      score: body.score,
      categoryId: body.categoryId,
    },
  });

  return NextResponse.json({ score }, { status: 201 });
}
