import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { backupPaths, toCsv, toJson, type FavItem } from "@/lib/bili";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mediaId?: string;
      title?: string;
      mediaCount?: number;
      items?: FavItem[];
    };
    const mediaId = body.mediaId ?? "";
    const items = Array.isArray(body.items) ? body.items : [];
    const paths = backupPaths(body.title ?? "", mediaId);
    const root = path.resolve(process.cwd(), "backups");
    const dir = path.resolve(process.cwd(), paths.folder);
    if (dir !== root && !dir.startsWith(`${root}${path.sep}`)) {
      return NextResponse.json({ error: "导出路径无效" }, { status: 400 });
    }
    await mkdir(dir, { recursive: true });
    const folder = { mediaId, title: body.title ?? "", mediaCount: Number(body.mediaCount) || items.length };
    await writeFile(path.resolve(process.cwd(), paths.csv), toCsv(items), "utf8");
    await writeFile(path.resolve(process.cwd(), paths.json), toJson(folder, items), "utf8");
    return NextResponse.json(paths);
  } catch (error) {
    const message = error instanceof Error ? error.message : "写入备份失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
