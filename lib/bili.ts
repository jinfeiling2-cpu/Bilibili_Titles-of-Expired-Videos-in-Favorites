import { createHash } from "node:crypto";

/** 电视端登录公开 appkey / appsec，签发的 access_key 必须用同一组密钥签名。 */
export const TV_APPKEY = "4409e2ce8ffd12b8";
export const TV_APPSEC = "59b43e04ad6965f34319062b478f83dd";

export const INVALID_TITLE = "已失效视频";
export const PAGE_SIZE = 20;
export const APP_STATISTICS = '{"appId":1,"platform":3,"version":"8.94.0","abtest":""}';

export function tvResourceParams(
  mediaId: string,
  accessKey: string,
  pn: string,
  ts: string,
): Record<string, string> {
  return {
    media_id: mediaId,
    pn,
    ps: "20",
    appkey: TV_APPKEY,
    access_key: accessKey,
    ts,
    mobi_app: "android",
    platform: "android",
    build: "8940300",
    disable_rcmd: "0",
    c_locale: "en",
    s_locale: "en",
    channel: "bili",
    statistics: APP_STATISTICS,
  };
}

/** 按参数名字母序拼成未编码的 key=value，供 MD5 使用。 */
export function signPlain(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

export function appSign(
  params: Record<string, string>,
  appsec = TV_APPSEC,
): string {
  return createHash("md5").update(signPlain(params) + appsec).digest("hex");
}

/** 先按原文签名，再把每个 key/value 做 encodeURIComponent 放进 URL 或 POST body。 */
export function signedParams(
  params: Record<string, string>,
  appsec = TV_APPSEC,
): string {
  const signed: Record<string, string> = { ...params, sign: appSign(params, appsec) };
  return Object.keys(signed)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(signed[key])}`)
    .join("&");
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
  oid?: number;
  type?: number;
  title?: string;
  cover?: string;
  intro?: string;
  duration?: number;
  upper?: { mid?: number; name?: string };
  attr?: number;
  is_invalid?: boolean | number;
  cnt_info?: { collect?: number; play?: number; danmaku?: number };
  ctime?: number;
  pubtime?: number;
  fav_time?: number;
  bv_id?: string;
  bvid?: string;
};

const INVALID_TITLES = new Set(["已失效视频", "已失效", "该视频已被删除"]);

export const PLACEHOLDER_TITLES = new Set([
  "",
  "已失效视频",
  "已失效",
  "该视频已被删除",
  "视频去哪了呢？",
  "正在加载数据...",
]);

export function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLES.has(title.trim());
}

export type FavItem = {
  avid: number;
  bvid: string;
  title: string;
  intro: string;
  introOriginalTitle: string;
  restoredTitle: string;
  upper: string;
  attr: number;
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
  const avid = Number(raw.oid ?? raw.id);
  if (!Number.isFinite(avid) || avid <= 0) return null;
  const bvid = raw.bvid || raw.bv_id || "";
  const title = raw.title ?? "";
  const intro = raw.intro ?? "";
  const cover = (raw.cover ?? "").replace(/^http:\/\//i, "https://");
  const attr = Number(raw.attr) || 0;
  const invalid =
    INVALID_TITLES.has(title.trim()) ||
    attr === 1 ||
    attr === 9 ||
    raw.is_invalid === true ||
    raw.is_invalid === 1 ||
    cover.includes("be27fd62");
  return {
    avid,
    bvid,
    title,
    intro,
    introOriginalTitle: extractOriginalTitle(intro),
    restoredTitle: "",
    upper: raw.upper?.name ?? "",
    attr,
    invalid,
    link: bvid
      ? `https://www.bilibili.com/video/${bvid}`
      : `https://www.bilibili.com/video/av${avid}`,
    favTime: Number(raw.fav_time) || 0,
    pubTime: Number(raw.pubtime || raw.ctime) || 0,
    duration: Number(raw.duration) || 0,
    play: Number(raw.cnt_info?.play) || 0,
    danmaku: Number(raw.cnt_info?.danmaku) || 0,
    favorite: Number(raw.cnt_info?.collect) || 0,
    cover,
  };
}

export function bestTitle(item: FavItem): string {
  if (item.restoredTitle && !isPlaceholderTitle(item.restoredTitle)) {
    return item.restoredTitle;
  }
  if (item.introOriginalTitle) return item.introOriginalTitle;
  return item.title;
}

export function statusLabel(item: FavItem): string {
  if (!item.invalid) return "正常";
  const base = item.attr === 9 ? "UP 主删除" : item.attr === 1 ? "其他原因下架" : "已失效";
  if (item.restoredTitle && !isPlaceholderTitle(item.restoredTitle)) {
    return `${base}（已找回原标题）`;
  }
  return base;
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

export function hasMoreFromPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  return data.has_more === true || data.has_more === 1;
}

export type HasMorePage<T> = {
  items: T[];
  hasMore: boolean;
  error?: string;
};

/** 按接口的 has_more 翻页。本页为空或 has_more 为假就停；某一页报错则保留已拿到的条目。 */
export async function collectWhileHasMore<T>(
  fetchPage: (pn: number) => Promise<HasMorePage<T>>,
): Promise<{ items: T[]; warning?: string }> {
  const items: T[] = [];
  for (let pn = 1; pn <= 500; pn++) {
    const page = await fetchPage(pn);
    if (page.error) {
      return { items, warning: page.error };
    }
    if (page.items.length === 0) break;
    items.push(...page.items);
    if (!page.hasMore) break;
  }
  return { items };
}
