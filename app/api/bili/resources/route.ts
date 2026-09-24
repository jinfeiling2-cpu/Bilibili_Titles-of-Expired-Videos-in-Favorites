import { NextResponse } from "next/server";
import { parseMediaId } from "@/lib/bili";
import { fetchSignedResources } from "@/lib/bili-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: string; accessKey?: string };
    const mediaId = parseMediaId(body.input ?? "");
    const accessKey = body.accessKey?.trim() ?? "";
    if (!/^[A-Za-z0-9]{16,256}$/.test(accessKey)) {
      return NextResponse.json({ error: "access_key 无效，请先用手机客户端扫码登录" }, { status: 400 });
    }
    const items = await fetchSignedResources(mediaId, accessKey);
    return NextResponse.json({
      mediaId,
      items: items.map((item) => ({
        avid: item.avid,
        title: item.title,
        cover: item.cover,
        intro: item.intro,
        upper: item.upper,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "签名接口请求失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
