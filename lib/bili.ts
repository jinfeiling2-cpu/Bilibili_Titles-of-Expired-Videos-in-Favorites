import { createHash } from "node:crypto";

/** 电视端登录公开 appkey / appsec，签发的 access_key 必须用同一组密钥签名。 */
export const TV_APPKEY = "4409e2ce8ffd12b8";
export const TV_APPSEC = "59b43e04ad6965f34319062b478f83dd";

export const INVALID_TITLE = "已失效视频";
export const PAGE_SIZE = 20;

export function appSign(
  params: Record<string, string>,
  appsec = TV_APPSEC,
): string {
  const search = new URLSearchParams(params);
  search.sort();
  return createHash("md5").update(search.toString() + appsec).digest("hex");
}

export function signedParams(
  params: Record<string, string>,
  appsec = TV_APPSEC,
): URLSearchParams {
  const search = new URLSearchParams(params);
  search.sort();
  const sign = createHash("md5").update(search.toString() + appsec).digest("hex");
  search.set("sign", sign);
  return search;
}

export function parseMediaId(input: string): string {
  const text = input.trim();
  if (!text) {
    throw new Error("请填写收藏夹链接或 media_id");
  }
  if (/^\d+$/.test(text)) return text;

  const fromQuery = text.match(/(?:fid|media_id)=(\d+)/i);
  if (fromQuery) return fromQuery[1];

  const fromMl = text.match(/ml(\d+)/i);
  if (fromMl) return fromMl[1];

  const digits = text.match(/(\d{4,})/);
  if (digits) return digits[1];

  throw new Error("无法从输入中识别 media_id");
}

export function extractOriginalTitle(intro: string): string {
  const matched = intro.match(/原标题\s*[:：]\s*([^\r\n]+)/);
  return matched ? matched[1].trim() : "";
}

export type PageSlice<T> = {
  items: T[];
  mediaCount: number;
};

/**
 * 按 media_count 翻完所有页。中间页偶尔少返回一条时继续请求后续页，不把短页当成结束。
 */
export async function collectAllPages<T>(
  fetchPage: (pn: number) => Promise<PageSlice<T>>,
  ps = PAGE_SIZE,
): Promise<{ items: T[]; mediaCount: number }> {
  const first = await fetchPage(1);
  const mediaCount = Math.max(0, first.mediaCount);
  const pageCount = Math.max(1, Math.ceil(mediaCount / ps) || 1);
  const items = [...first.items];

  for (let pn = 2; pn <= pageCount; pn++) {
    const page = await fetchPage(pn);
    items.push(...page.items);
  }

  let extra = 0;
  while (items.length < mediaCount && extra < 3) {
    extra += 1;
    const page = await fetchPage(pageCount + extra);
    if (page.items.length === 0) break;
    items.push(...page.items);
  }

  return { items, mediaCount };
}

export type RawMedia = {
  id?: number;
  type?: number;
  title?: string;
  cover?: string;
  intro?: string;
  duration?: number;
  upper?: { mid?: number; name?: string };
  attr?: number;
  cnt_info?: { collect?: number; play?: number; danmaku?: number };
  ctime?: number;
  pubtime?: number;
  fav_time?: number;
  bv_id?: string;
  bvid?: string;
};

export type FavItem = {
  avid: number;
  bvid: string;
  title: string;
  intro: string;
  introOriginalTitle: string;
  restoredTitle: string;
  upper: string;
  invalid: boolean;
  link: string;
  favTime: number;
  pubTime: number;
  duration: number;
  play: number;
  danmaku: number;
  favorite: number;
  cover: string;
};

export function normalizeMedia(raw: RawMedia): FavItem | null {
  const avid = Number(raw.id);
  if (!Number.isFinite(avid) || avid <= 0) return null;
  const bvid = raw.bvid || raw.bv_id || "";
  const title = raw.title ?? "";
  const intro = raw.intro ?? "";
  return {
    avid,
    bvid,
    title,
    intro,
    introOriginalTitle: extractOriginalTitle(intro),
    restoredTitle: "",
    upper: raw.upper?.name ?? "",
    invalid: title === INVALID_TITLE,
    link: bvid
      ? `https://www.bilibili.com/video/${bvid}`
      : `https://www.bilibili.com/video/av${avid}`,
    favTime: Number(raw.fav_time) || 0,
    pubTime: Number(raw.pubtime || raw.ctime) || 0,
    duration: Number(raw.duration) || 0,
    play: Number(raw.cnt_info?.play) || 0,
    danmaku: Number(raw.cnt_info?.danmaku) || 0,
    favorite: Number(raw.cnt_info?.collect) || 0,
    cover: (raw.cover ?? "").replace(/^http:\/\//i, "https://"),
  };
}

export function bestTitle(item: FavItem): string {
  if (item.restoredTitle && item.restoredTitle !== INVALID_TITLE) {
    return item.restoredTitle;
  }
  if (item.introOriginalTitle) return item.introOriginalTitle;
  return item.title;
}

export function statusLabel(item: FavItem): string {
  if (!item.invalid) return "正常";
  if (item.restoredTitle && item.restoredTitle !== INVALID_TITLE) {
    return "已失效（已找回原标题）";
  }
  if (item.introOriginalTitle) return "已失效（简介含原标题）";
  return "已失效";
}

export function formatUnix(seconds: number): string {
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${m}:${ss}`;
}

export const EXPORT_COLUMNS = [
  "标题",
  "简介",
  "UP主",
  "状态",
  "av",
  "BV",
  "链接",
  "收藏时间",
  "投稿时间",
  "时长",
  "播放",
  "弹幕",
  "收藏数",
  "封面",
] as const;

export function toExportRow(item: FavItem): Record<(typeof EXPORT_COLUMNS)[number], string | number> {
  return {
    标题: bestTitle(item),
    简介: item.intro,
    UP主: item.upper,
    状态: statusLabel(item),
    av: item.avid,
    BV: item.bvid,
    链接: item.link,
    收藏时间: formatUnix(item.favTime),
    投稿时间: formatUnix(item.pubTime),
    时长: formatDuration(item.duration),
    播放: item.play,
    弹幕: item.danmaku,
    收藏数: item.favorite,
    封面: item.cover,
  };
}

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(items: FavItem[]): string {
  const lines = [
    EXPORT_COLUMNS.join(","),
    ...items.map((item) => {
      const row = toExportRow(item);
      return EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(",");
    }),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function toJson(folder: { mediaId: string; title: string; mediaCount: number }, items: FavItem[]): string {
  return JSON.stringify(
    {
      mediaId: folder.mediaId,
      title: folder.title,
      mediaCount: folder.mediaCount,
      exportedAt: new Date().toISOString(),
      items: items.map(toExportRow),
    },
    null,
    2,
  );
}

export function mediasFromPayload(payload: unknown): RawMedia[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  if (Array.isArray(data)) return data as RawMedia[];
  for (const key of ["medias", "media_list", "list", "resources"]) {
    if (Array.isArray(data[key])) return data[key] as RawMedia[];
  }
  return [];
}

export function mediaCountFromPayload(payload: unknown, fallback: number): number {
  if (!payload || typeof payload !== "object") return fallback;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const info = data.info && typeof data.info === "object" ? (data.info as Record<string, unknown>) : undefined;
  const count = Number(info?.media_count ?? data.media_count ?? data.total_count ?? data.count);
  return Number.isFinite(count) && count >= 0 ? count : fallback;
}

export function folderTitleFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const info = data.info && typeof data.info === "object" ? (data.info as Record<string, unknown>) : undefined;
  return String(info?.title ?? data.title ?? "");
}
