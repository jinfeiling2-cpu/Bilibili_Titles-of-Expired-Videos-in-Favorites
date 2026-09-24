import { NextResponse } from "next/server";
import { createTvQr } from "@/lib/bili-server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const qr = await createTvQr();
    return NextResponse.json(qr);
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取二维码失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
