import QRCode from "qrcode";
import {
  PAGE_SIZE,
  TV_APPKEY,
  collectAllPages,
  folderTitleFromPayload,
  mediaCountFromPayload,
  mediasFromPayload,
  normalizeMedia,
  signedParams,
  type FavItem,
  type RawMedia,
} from "./bili";

const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function unixTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`哔哩哔哩返回了无法解析的内容（HTTP ${response.status}）`);
  }
}

function assertOk(payload: unknown, fallback: string): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new Error(fallback);
  }
  const body = payload as Record<string, unknown>;
  const code = Number(body.code);
  if (code !== 0) {
    const message = typeof body.message === "string" && body.message ? body.message : fallback;
    throw new Error(`${message}（${code}）`);
  }
  return body;
}

export async function createTvQr(): Promise<{ url: string; authCode: string; image: string }> {
  const body = signedParams({
    appkey: TV_APPKEY,
    local_id: "0",
    ts: unixTs(),
  });
  const response = await fetch("https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = assertOk(await readJson(response), "获取登录二维码失败");
  const data = payload.data as { url?: string; auth_code?: string } | undefined;
  if (!data?.url || !data.auth_code) throw new Error("二维码响应缺少 url 或 auth_code");
  const image = await QRCode.toDataURL(data.url, { margin: 1, width: 280 });
  return { url: data.url, authCode: data.auth_code, image };
}

export type QrPoll =
  | { status: "pending"; message: string }
  | { status: "ok"; accessKey: string; mid: number };

export async function pollTvQr(authCode: string): Promise<QrPoll> {
  const body = signedParams({
    appkey: TV_APPKEY,
    auth_code: authCode,
    local_id: "0",
    ts: unixTs(),
  });
  const response = await fetch("https://passport.bilibili.com/x/passport-tv-login/qrcode/poll", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await readJson(response);
  if (!payload || typeof payload !== "object") throw new Error("轮询登录状态失败");
  const bodyJson = payload as Record<string, unknown>;
  const code = Number(bodyJson.code);
  if (code === 0) {
    const data = bodyJson.data as { access_token?: string; mid?: number } | undefined;
    if (!data?.access_token) throw new Error("登录成功但没有返回 access_key");
    return { status: "ok", accessKey: data.access_token, mid: Number(data.mid) || 0 };
  }
  if (code === 86039) return { status: "pending", message: "等待扫码" };
  if (code === 86090) return { status: "pending", message: "已扫码，请在手机上确认" };
  if (code === 86038) throw new Error("二维码已失效，请重新获取");
  const message = typeof bodyJson.message === "string" ? bodyJson.message : "轮询登录状态失败";
  throw new Error(`${message}（${code}）`);
}

function mapMedias(raws: RawMedia[]): FavItem[] {
  const seen = new Set<string>();
  const items: FavItem[] = [];
  for (const raw of raws) {
    const item = normalizeMedia(raw);
    if (!item) continue;
    const key = `${raw.type ?? 2}:${item.avid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

export async function fetchWebFolder(
  mediaId: string,
  sessdata?: string,
): Promise<{ title: string; mediaCount: number; items: FavItem[] }> {
  const load = async (pn: number) => {
    const url = new URL("https://api.bilibili.com/x/v3/fav/resource/list");
    url.searchParams.set("media_id", mediaId);
    url.searchParams.set("pn", String(pn));
    url.searchParams.set("ps", String(PAGE_SIZE));
    url.searchParams.set("platform", "web");
    url.searchParams.set("order", "mtime");
    const headers: Record<string, string> = {
      "User-Agent": WEB_UA,
      Referer: "https://www.bilibili.com",
    };
    if (sessdata) headers.Cookie = `SESSDATA=${sessdata}`;
    const response = await fetch(url, { headers, cache: "no-store" });
    const payload = assertOk(await readJson(response), "读取收藏夹失败");
    const raws = mediasFromPayload(payload);
    return {
      items: raws,
      mediaCount: mediaCountFromPayload(payload, raws.length),
      title: folderTitleFromPayload(payload),
    };
  };

  const first = await load(1);
  const collected = await collectAllPages(async (pn) => {
    if (pn === 1) return { items: first.items, mediaCount: first.mediaCount };
    const page = await load(pn);
    return { items: page.items, mediaCount: first.mediaCount };
  }, PAGE_SIZE);

  return {
    title: first.title,
    mediaCount: collected.mediaCount,
    items: mapMedias(collected.items),
  };
}

export async function fetchSignedResources(mediaId: string, accessKey: string): Promise<FavItem[]> {
  const load = async (pn: number) => {
    const params = signedParams({
      access_key: accessKey,
      appkey: TV_APPKEY,
      media_id: mediaId,
      pn: String(pn),
      ps: String(PAGE_SIZE),
      ts: unixTs(),
    });
    const url = `https://api.bilibili.com/x/v3/fav/folder/resources?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": WEB_UA,
        Referer: "https://www.bilibili.com",
      },
      cache: "no-store",
    });
    const payload = assertOk(await readJson(response), "签名接口读取收藏夹失败");
    const raws = mediasFromPayload(payload);
    return {
      items: raws,
      mediaCount: mediaCountFromPayload(payload, raws.length),
    };
  };

  const collected = await collectAllPages(load, PAGE_SIZE);
  return mapMedias(collected.items);
}
