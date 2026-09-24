import { NextResponse } from "next/server";
import { pollTvQr } from "@/lib/bili-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { authCode?: string };
    const authCode = body.authCode?.trim() ?? "";
    if (!/^[A-Za-z0-9]{16,128}$/.test(authCode)) {
      return NextResponse.json({ error: "auth_code 无效" }, { status: 400 });
    }
    const result = await pollTvQr(authCode);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "轮询失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
