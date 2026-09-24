"use client";

import Image from "next/image";
import { useEffect, useMemo, useSyncExternalStore, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  bestTitle,
  formatDuration,
  formatUnix,
  isPlaceholderTitle,
  statusLabel,
  toCsv,
  toJson,
  type FavItem,
} from "@/lib/bili";

const ACCESS_KEY_STORAGE = "bili_fav_access_key";
const ACCESS_KEY_EVENT = "bili-fav-access-key";

function readAccessKey(): string {
  return sessionStorage.getItem(ACCESS_KEY_STORAGE) ?? "";
}

function writeAccessKey(value: string) {
  if (value) sessionStorage.setItem(ACCESS_KEY_STORAGE, value);
  else sessionStorage.removeItem(ACCESS_KEY_STORAGE);
  window.dispatchEvent(new Event(ACCESS_KEY_EVENT));
}

function useAccessKey() {
  const accessKey = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(ACCESS_KEY_EVENT, onStoreChange);
      return () => window.removeEventListener(ACCESS_KEY_EVENT, onStoreChange);
    },
    readAccessKey,
    () => "",
  );
  return [accessKey, writeAccessKey] as const;
}

type FolderPayload = {
  mediaId: string;
  title: string;
  mediaCount: number;
  items: FavItem[];
};

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40) || "收藏夹";
}

export function FavTool() {
  const [input, setInput] = useState("");
  const [sessdata, setSessdata] = useState("");
  const [accessKey, setAccessKey] = useAccessKey();
  const [qrImage, setQrImage] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [qrMessage, setQrMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [folder, setFolder] = useState<FolderPayload | null>(null);
  const [onlyInvalid, setOnlyInvalid] = useState(false);

  useEffect(() => {
    if (!authCode) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/bili/qr/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authCode }),
        });
        const data = (await response.json()) as {
          error?: string;
          status?: string;
          message?: string;
          accessKey?: string;
        };
        if (stopped) return;
        if (!response.ok) {
          setQrMessage(data.error || "轮询失败");
          setAuthCode("");
          return;
        }
        if (data.status === "ok" && data.accessKey) {
          setAccessKey(data.accessKey);
          setQrMessage("扫码成功。access_key 只保存在本页的 sessionStorage，关闭标签页后消失。");
          setAuthCode("");
          setQrImage("");
          return;
        }
        setQrMessage(data.message || "等待扫码");
      } catch {
        if (!stopped) setQrMessage("轮询登录状态时网络出错");
      }
    }, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [authCode, setAccessKey]);

  const visible = useMemo(() => {
    if (!folder) return [];
    return onlyInvalid ? folder.items.filter((item) => item.invalid) : folder.items;
  }, [folder, onlyInvalid]);

  const invalidCount = folder?.items.filter((item) => item.invalid).length ?? 0;

  async function loadFolder(): Promise<FolderPayload> {
    const response = await fetch("/api/bili/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, sessdata }),
    });
    const data = (await response.json()) as FolderPayload & { error?: string };
    if (!response.ok) throw new Error(data.error || "读取收藏夹失败");
    return data;
  }

  async function restoreTitles(current: FolderPayload): Promise<{ folder: FolderPayload; warning: string }> {
    if (!accessKey) return { folder: current, warning: "" };
    try {
      const response = await fetch("/api/bili/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, accessKey }),
      });
      const data = (await response.json()) as {
        error?: string;
        warning?: string;
        items?: { avid: number; title: string }[];
      };
      if (!response.ok) {
        return { folder: current, warning: data.error || "签名接口请求失败" };
      }
      const titles = new Map((data.items ?? []).map((item) => [item.avid, item.title]));
      return {
        warning: data.warning || "",
        folder: {
          ...current,
          items: current.items.map((item) => {
            const restored = titles.get(item.avid) ?? "";
            if (isPlaceholderTitle(restored)) return item;
            return { ...item, restoredTitle: restored };
          }),
        },
      };
    } catch (reason) {
      const warning = reason instanceof Error ? reason.message : "签名接口请求失败";
      return { folder: current, warning };
    }
  }

  async function findInvalid() {
    setError("");
    setNote("");
    setBusy("正在按 media_count 翻页读取收藏夹…");
    try {
      const loaded = await loadFolder();
      setFolder(loaded);
      setOnlyInvalid(true);
      setBusy(accessKey ? "正在用已签名的客户端接口尝试找回原标题…" : "");
      const { folder: merged, warning } = await restoreTitles(loaded);
      setFolder(merged);
      const found = merged.items.filter((item) => item.invalid).length;
      const restored = merged.items.filter((item) => item.restoredTitle && !isPlaceholderTitle(item.restoredTitle)).length;
      if (warning) setError(`签名接口没有找回原标题：${warning}`);
      if (!accessKey) {
        setNote(
          `找到 ${found} 条失效视频。简介里的「原标题：」已摘出。SESSDATA 不能恢复原标题；要用客户端接口找回标题，请先扫码拿到 access_key。`,
        );
      } else {
        setNote(`找到 ${found} 条失效视频，其中 ${restored} 条从签名接口拿到了原标题。网页列表里的 UP 主和简介仍会保留。`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "查找失败");
    } finally {
      setBusy("");
    }
  }

  async function exportAll() {
    setError("");
    setNote("");
    setBusy("正在读取全部视频…");
    try {
      const loaded = folder && folder.items.length > 0 ? folder : await loadFolder();
      setFolder(loaded);
      setOnlyInvalid(false);
      const base = `${safeName(loaded.title)}-${loaded.mediaId}`;
      download(`${base}.csv`, toCsv(loaded.items), "text/csv;charset=utf-8");
      download(`${base}.json`, toJson(loaded, loaded.items), "application/json;charset=utf-8");
      const saved = await fetch("/api/bili/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loaded),
      });
      const savedBody = (await saved.json()) as { error?: string; folder?: string };
      if (!saved.ok) throw new Error(savedBody.error || "写入 backups 失败");
      setNote(
        `已下载 ${loaded.items.length} 条（收藏夹计数 ${loaded.mediaCount}），并写入 ${savedBody.folder}。该目录已被 Git 忽略，不要提交。`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导出失败");
    } finally {
      setBusy("");
    }
  }

  async function startQr() {
    setError("");
    setQrMessage("正在获取二维码…");
    try {
      const response = await fetch("/api/bili/qr", { method: "POST" });
      const data = (await response.json()) as { error?: string; image?: string; authCode?: string };
      if (!response.ok || !data.image || !data.authCode) {
        throw new Error(data.error || "获取二维码失败");
      }
      setQrImage(data.image);
      setAuthCode(data.authCode);
      setQrMessage("请用哔哩哔哩手机客户端扫描。微信扫码无效。");
    } catch (reason) {
      setQrMessage("");
      setError(reason instanceof Error ? reason.message : "获取二维码失败");
    }
  }

  function clearAccessKey() {
    setAccessKey("");
    setQrMessage("已清除本页 sessionStorage 中的 access_key。");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">哔哩哔哩收藏夹工具</h1>
        <p className="text-sm text-muted-foreground">
          查找标题被换成「已失效视频」的条目，并导出收藏夹里的全部视频。扫码得到的 access_key 只放在浏览器 sessionStorage。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>收藏夹</CardTitle>
          <CardDescription>支持收藏夹链接，或只填 media_id / fid。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="media">收藏夹链接或 media_id</Label>
            <Input
              id="media"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="https://space.bilibili.com/uid/favlist?fid=123 或 123"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sessdata">SESSDATA（仅私密收藏夹需要）</Label>
            <Textarea
              id="sessdata"
              value={sessdata}
              onChange={(event) => setSessdata(event.target.value)}
              placeholder="只粘贴 SESSDATA 的值，不要带 Cookie 名或其他项"
              rows={3}
            />
            <p className="text-sm leading-6 text-muted-foreground">
              打开已登录的哔哩哔哩网页，按 F12，进入 Application（应用）→ Cookies → https://www.bilibili.com，找到名为 SESSDATA 的项，复制它的值，粘贴到上面这个「SESSDATA」输入框。它只随本次请求发到本机接口，用来读取私密收藏夹，不会写入磁盘或 localStorage。SESSDATA 不能恢复原标题。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={findInvalid} disabled={Boolean(busy)}>
              查找失效视频
            </Button>
            <Button type="button" variant="outline" onClick={exportAll} disabled={Boolean(busy)}>
              导出全部视频
            </Button>
          </div>
          {busy ? <p className="text-sm">{busy}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>扫码获取 access_key</CardTitle>
          <CardDescription>
            使用电视端登录接口 passport.bilibili.com/x/passport-tv-login/qrcode。确认后用该 access_key 请求已签名的 api.bilibili.com/x/v3/fav/folder/resources，尝试要回原标题。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={startQr}>
              获取登录二维码
            </Button>
            <Button type="button" variant="ghost" onClick={clearAccessKey} disabled={!accessKey}>
              清除 access_key
            </Button>
          </div>
          {qrImage ? (
            // 二维码是 data:image/png;base64，next/image 不接受这种地址。
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImage} alt="哔哩哔哩登录二维码" className="h-52 w-52 rounded-md border" />
          ) : null}
          <p className="text-sm text-muted-foreground">
            {accessKey ? `已保存 access_key（${accessKey.slice(0, 6)}…），仅在当前标签页的 sessionStorage。` : "尚未扫码。"}
            {qrMessage ? ` ${qrMessage}` : ""}
          </p>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>请求没有完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {note ? (
        <Alert>
          <AlertTitle>结果</AlertTitle>
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      ) : null}

      {folder ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium">{folder.title || "收藏夹"}</h2>
            <Badge variant="secondary">media_id {folder.mediaId}</Badge>
            <Badge variant="outline">
              列出 {folder.items.length} / 计数 {folder.mediaCount}
            </Badge>
            <Badge variant="outline">失效 {invalidCount}</Badge>
            <Button type="button" size="sm" variant="outline" onClick={() => setOnlyInvalid((value) => !value)}>
              {onlyInvalid ? "显示全部条目" : "只看失效"}
            </Button>
          </div>
          <Separator />
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>封面</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>简介</TableHead>
                  <TableHead>简介原标题</TableHead>
                  <TableHead>UP 主</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>av / BV</TableHead>
                  <TableHead>收藏时间</TableHead>
                  <TableHead>投稿时间</TableHead>
                  <TableHead>时长</TableHead>
                  <TableHead>播放</TableHead>
                  <TableHead>弹幕</TableHead>
                  <TableHead>收藏数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((item) => (
                  <TableRow key={`${item.avid}`}>
                    <TableCell>
                      {item.cover ? (
                        <Image
                          src={item.cover}
                          alt=""
                          width={80}
                          height={48}
                          unoptimized
                          className="h-12 w-20 rounded object-cover"
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      <a href={item.link} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {bestTitle(item)}
                      </a>
                      {item.invalid ? (
                        <div className="text-xs text-muted-foreground">网页标题：{item.title}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{item.intro}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{item.introOriginalTitle}</TableCell>
                    <TableCell>{item.upper}</TableCell>
                    <TableCell>{statusLabel(item)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      av{item.avid}
                      <br />
                      {item.bvid}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatUnix(item.favTime)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatUnix(item.pubTime)}</TableCell>
                    <TableCell>{formatDuration(item.duration)}</TableCell>
                    <TableCell>{item.play}</TableCell>
                    <TableCell>{item.danmaku}</TableCell>
                    <TableCell>{item.favorite}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
