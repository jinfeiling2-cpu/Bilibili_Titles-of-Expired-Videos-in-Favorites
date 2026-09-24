# 哔哩哔哩收藏夹工具

在本地查看自己的哔哩哔哩收藏夹：找出标题已被换成「已失效视频」的条目，并把收藏夹里的全部视频导出成 CSV 和 JSON。

网页接口仍会留下 av/BV、UP 主、简介和收藏时间。简介里如果写了「原标题：」，页面会摘出来。要尝试要回原标题，需要用哔哩哔哩手机客户端扫描电视端登录二维码，拿到 `access_key`，再请求已签名的 `https://api.bilibili.com/x/v3/fav/folder/resources`。`SESSDATA` 只能用来读取私密收藏夹，不能恢复原标题。

扫码得到的凭据只放在浏览器 `sessionStorage`，关闭标签页后消失。

## 本地运行

需要 Node.js 22。

```bash
npm install
npm run dev
```

开发服务器监听 **43127** 端口。用浏览器打开：

- http://127.0.0.1:43127
- http://localhost:43127

`next.config.ts` 里设置了 `allowedDevOrigins: ["127.0.0.1", "localhost"]`，否则用 `127.0.0.1` 打开时按钮没有反应。

## 怎么用

1. 粘贴收藏夹链接，或只填 `media_id`。例如 `https://space.bilibili.com/{uid}/favlist?fid={media_id}` 里的 `fid`。
2. 公开收藏夹可以直接点「查找失效视频」或「导出全部视频」。
3. 私密收藏夹需要在页面上的 **SESSDATA** 输入框里填值，见下一节。
4. 要找回原标题：点「获取登录二维码」，用哔哩哔哩手机客户端扫描并确认。微信扫码无效。
5. 「导出全部视频」会下载 CSV 和 JSON，页面同时列出全部条目。字段包括标题、简介、UP 主、状态、av/BV、链接、收藏时间、投稿时间、时长、播放、弹幕、收藏数、封面。

列表按接口里的 `media_count` 翻页。某一页偶尔少返回一条时，仍会继续请求后面的页。

## SESSDATA 怎么取

1. 用已经登录哔哩哔哩的浏览器打开 https://www.bilibili.com 。
2. 按 F12 打开开发者工具。
3. 打开 **Application**（应用）→ **Cookies** → `https://www.bilibili.com`。
4. 找到名为 **SESSDATA** 的项，只复制它的值。
5. 粘贴到本工具页面里标注为 **SESSDATA** 的输入框。

这个值等于网页登录态，只用于当次读取收藏夹的请求，不要发给别人，也不要写进仓库。

## 导出文件放哪

浏览器下载的 CSV 和 JSON 请放到 `backups/`。这个目录里的备份已在 `.gitignore` 中忽略。仓库可以公开，但不要提交 SESSDATA、Cookie，或用户导出的收藏夹备份。`.gitignore` 会忽略 `*SESSDATA*` 和 `*.cookie`。
