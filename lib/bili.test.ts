import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appSign,
  bestTitle,
  collectAllPages,
  extractOriginalTitle,
  parseMediaId,
  statusLabel,
  toCsv,
  type FavItem,
} from "./bili.ts";

describe("appSign", () => {
  it("matches the documented TV login sample", () => {
    const sign = appSign({
      appkey: "4409e2ce8ffd12b8",
      local_id: "0",
      ts: "0",
    });
    assert.equal(sign, "e134154ed6add881d28fbdf68653cd9c");
  });
});

describe("parseMediaId", () => {
  it("accepts a bare media id and common folder links", () => {
    assert.equal(parseMediaId("1052622027"), "1052622027");
    assert.equal(
      parseMediaId("https://space.bilibili.com/686127/favlist?fid=1052622027&ftype=create"),
      "1052622027",
    );
    assert.equal(parseMediaId("https://www.bilibili.com/medialist/detail/ml1052622027"), "1052622027");
    assert.equal(parseMediaId("media_id=1052622027"), "1052622027");
  });
});

describe("extractOriginalTitle", () => {
  it("reads 原标题 from the intro", () => {
    assert.equal(extractOriginalTitle("说明\n原标题：旧的名字\n其他"), "旧的名字");
    assert.equal(extractOriginalTitle("原标题:半角冒号"), "半角冒号");
    assert.equal(extractOriginalTitle("没有原标题"), "");
  });
});

describe("collectAllPages", () => {
  it("keeps going when a middle page returns one fewer item", async () => {
    const pages: Record<number, number[]> = {
      1: [1, 2],
      2: [3],
      3: [4, 5],
    };
    const requested: number[] = [];
    const { items, mediaCount } = await collectAllPages(async (pn) => {
      requested.push(pn);
      return { items: pages[pn] ?? [], mediaCount: 5 };
    }, 2);
    assert.deepEqual(items, [1, 2, 3, 4, 5]);
    assert.equal(mediaCount, 5);
    assert.deepEqual(requested, [1, 2, 3]);
  });
});

describe("export", () => {
  it("prefers the restored title and escapes csv", () => {
    const item: FavItem = {
      avid: 1,
      bvid: "BV1xx",
      title: "已失效视频",
      intro: '原标题：他说"你好"\n第二行',
      introOriginalTitle: '他说"你好"',
      restoredTitle: "接口原标题",
      upper: "UP",
      invalid: true,
      link: "https://www.bilibili.com/video/BV1xx",
      favTime: 0,
      pubTime: 0,
      duration: 65,
      play: 1,
      danmaku: 2,
      favorite: 3,
      cover: "https://example.com/a.jpg",
    };
    assert.equal(bestTitle(item), "接口原标题");
    assert.equal(statusLabel(item), "已失效（已找回原标题）");
    const csv = toCsv([item]);
    assert.match(csv, /接口原标题/);
    assert.match(csv, /"原标题：他说""你好""/);
  });
});
