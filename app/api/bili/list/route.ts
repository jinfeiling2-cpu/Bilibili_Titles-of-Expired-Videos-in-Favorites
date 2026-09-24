import { NextResponse } from "next/server";
import { parseMediaId } from "@/lib/bili";
import { fetchWebFolder } from "@/lib/bili-server";

export const dynamic = "force-dynamic";

function cleanSessdata(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > 512 || /[\s;,]/.test(text)) {
    throw new Error("SESSDATA 格式不正确。请只粘贴 Cookie 里 SESSDATA 这一项的值。");
  }
  return text;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: string; sessdata?: string };
    const mediaId = parseMediaId(body.input ?? "");
    const sessdata = cleanSessdata(body.sessdata);
    const folder = await fetchWebFolder(mediaId, sessdata);
    return NextResponse.json({ mediaId, ...folder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取收藏夹失败";
    const status = /请填写|无法识别|SESSDATA/.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
