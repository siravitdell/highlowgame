import { NextRequest, NextResponse } from "next/server";
import { getAblyRest } from "@/lib/ably";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId") ?? undefined;
  const ably = getAblyRest();

  const tokenRequest = await ably.auth.createTokenRequest({ clientId });

  return NextResponse.json(tokenRequest);
}
