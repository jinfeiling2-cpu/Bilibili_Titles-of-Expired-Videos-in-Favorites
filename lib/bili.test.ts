import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import {
  TV_APPSEC,
  appSign,
  bestTitle,
  collectAllPages,
  collectWhileHasMore,
  extractOriginalTitle,
  normalizeMedia,
  parseMediaId,
  signPlain,
  signedParams,
  statusLabel,
  tvResourceParams,
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

  it("hashes statistics with literal braces, then encodes them only in the URL", () => {
    const params = { statistics: '{"appId":1}' };
    const plain = signPlain(params);
    assert.equal(plain, 'statistics={"appId":1}');
    assert.doesNotMatch(plain, /%7B/);
    assert.equal(appSign(params), createHash("md5").update(plain + TV_APPSEC).digest("hex"));
    const query = signedParams(params);
    assert.match(query, /statistics=%7B%22appId%22%3A1%7D/);
  });

  it("signs folder resources with the raw statistics object", () => {
    const params = tvResourceParams("1", "token_abc", "1", "0");
    const plain = signPlain(params);
    assert.match(plain, /statistics=\{"appId":1,"platform":3,"version":"8.94.0","abtest":""\}/);
    assert.doesNotMatch(plain, /%7B/);
    assert.match(plain, /mobi_app=android/);
    assert.match(plain, /disable_rcmd=0/);
    assert.match(plain, /build=8940300/);
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

describe("normalizeMedia", () => {
  it("uses oid and treats attr, placeholder titles, and the invalid cover as invalid", () => {
    const byOid = normalizeMedia({ oid: 42, id: 7, bv_id: "BV1oid", title: "还在", attr: 0 });
    assert.equal(byOid?.avid, 42);
    assert.equal(byOid?.bvid, "BV1oid");
    assert.equal(byOid?.invalid, false);

    assert.equal(normalizeMedia({ id: 1, title: " 已失效 ", attr: 0 })?.invalid, true);
    assert.equal(normalizeMedia({ id: 2, title: "正常", attr: 9 })?.invalid, true);
    assert.equal(statusLabel(normalizeMedia({ id: 2, title: "正常", attr: 9 })!), "UP 主删除");
    assert.equal(statusLabel(normalizeMedia({ id: 3, title: "正常", attr: 1 })!), "其他原因下架");
    assert.equal(normalizeMedia({ id: 4, title: "正常", is_invalid: 1 })?.invalid, true);
    assert.equal(
      normalizeMedia({ id: 5, title: "正常", cover: "https://i0.hdslb.com/bfs/archive/be27fd62c990.jpg" })?.invalid,
      true,
    );
    assert.equal(normalizeMedia({ title: "没有稿件号" }), null);

    const placeholder = normalizeMedia({ id: 6, title: "已失效视频", intro: "原标题：旧名字" });
    assert.ok(placeholder);
    placeholder.restoredTitle = "视频去哪了呢？";
    assert.equal(bestTitle(placeholder), "旧名字");
    placeholder.restoredTitle = "真正的标题";
    assert.equal(bestTitle(placeholder), "真正的标题");
    assert.equal(statusLabel(placeholder), "已失效（已找回原标题）");
  });
});

describe("collectWhileHasMore", () => {
  it("stops on an empty page or has_more false, and keeps earlier items when a later page fails", async () => {
    const stopped = await collectWhileHasMore(async (pn) => {
      if (pn === 1) return { items: [1], hasMore: true };
      return { items: [], hasMore: true };
    });
    assert.deepEqual(stopped.items, [1]);

    const failed = await collectWhileHasMore(async (pn) => {
      if (pn === 1) return { items: [1, 2], hasMore: true };
      return { items: [], hasMore: false, error: "签名失败（-3）" };
    });
    assert.deepEqual(failed.items, [1, 2]);
    assert.equal(failed.warning, "签名失败（-3）");
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
