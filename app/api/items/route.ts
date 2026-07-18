import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const categoryId = request.nextUrl.searchParams.get("category");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const all = request.nextUrl.searchParams.get("all") === "true";
  const limit = limitParam ? Number(limitParam) : 2;

  if (!categoryId) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  if (all) {
    const items = await prisma.item.findMany({ where: { categoryId } });
    if (items.length === 0) {
      return NextResponse.json({ error: "category not found or has no items" }, { status: 404 });
    }
    return NextResponse.json({ items });
  }

  const count = await prisma.item.count({ where: { categoryId } });
  if (count === 0) {
    return NextResponse.json({ error: "category not found or has no items" }, { status: 404 });
  }

  const skip = Math.max(0, Math.floor(Math.random() * count) - limit);
  const items = await prisma.item.findMany({
    where: { categoryId },
    skip,
    take: limit,
  });

  return NextResponse.json({ items });
}
