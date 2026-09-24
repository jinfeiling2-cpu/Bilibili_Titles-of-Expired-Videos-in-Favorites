# 哔哩哔哩收藏夹工具

在本地查看自己的哔哩哔哩收藏夹：找出标题已被换成「已失效视频」的条目，并把收藏夹里的全部视频导出成 CSV 和 JSON。

网页接口仍会留下 av/BV、UP 主、简介和收藏时间。简介里如果写了「原标题：」，页面会摘出来。要尝试要回原标题，需要用哔哩哔哩手机客户端扫描电视端登录二维码，拿到 `access_key`，再请求已签名的 `https://api.bilibili.com/x/v3/fav/folder/resources`。`SESSDATA` 只能用来读取私密收藏夹，不能恢复原标题。

扫码得到的凭据只放在浏览器 `sessionStorage`，关闭标签页后消失。

## 在 GitHub 上为什么打不开

GitHub 只负责存放代码。打开下面这个地址，看到的是文件列表，不是能点的工具页面：

https://github.com/jinfeiling2-cpu/Bilibili_Titles-of-Expired-Videos-in-Favorites

`http://127.0.0.1:43127` 的意思是「这台电脑自己」。必须先在你自己的电脑上把程序启动，浏览器才能打开。没启动就访问，或者用手机去开这个地址，都会显示无法连接。

## 在自己电脑上运行（第一次）

下面以 Windows 为例。

1. 安装 Node.js。打开 https://nodejs.org ，下载 **22** 版本的 Windows 安装包，一直点下一步。装好后先关掉已经打开的命令窗口，再打开新的。
2. 安装 GitHub Desktop（比记命令容易）。打开 https://desktop.github.com 下载并安装。用你的 GitHub 账号登录。
3. 在 GitHub Desktop 里选择 **File（文件）→ Clone repository（克隆仓库）**。切到 **URL**，粘贴：

   `https://github.com/jinfeiling2-cpu/Bilibili_Titles-of-Expired-Videos-in-Favorites`

   本地路径选一个你找得到的文件夹，例如「文档」。然后点 **Clone**。
4. 克隆完成后，菜单选 **Repository → Open in Command Prompt**（或「在终端中打开」）。会弹出一个黑窗口，当前目录就是这个项目。
5. 在黑窗口里依次输入下面两行，每行输入完按一次回车。第一行要等它自己跑完，不要关掉窗口。

   ```bash
   npm install
   npm run dev
   ```

6. 看到类似 `Local: http://127.0.0.1:43127` 之后，打开 Chrome 或 Edge，地址栏输入：

   http://127.0.0.1:43127

7. 使用期间不要关那个黑窗口。用完后，在黑窗口里按 `Ctrl + C`，再按 `Y` 或回车，程序就停了。下次使用从第 5 步的 `npm run dev` 开始即可，不必再 `npm install`，除非项目有更新。

Mac 的差别只有两处：Node.js 选 macOS 安装包；GitHub Desktop 用 **Repository → Open in Terminal**。停止程序同样是在终端里按 `Ctrl + C`。

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

## 如何测试

```bash
npm test
npm run dev
```

用浏览器打开 http://127.0.0.1:43127 。

1. 公开收藏夹可以不登录。把链接或 `media_id` 填进去，点「查找失效视频」。失效条目会列出 UP 主、简介，以及简介里的「原标题：」。
2. 点「导出全部视频」。浏览器会下载 CSV 和 JSON，同时在项目里的 `backups/收藏夹名-media_id/` 写下同名的两个文件。
3. 私密收藏夹才需要按上一节粘贴 SESSDATA。它只用于读取列表，不能找回原标题。
4. 找回原标题：点「获取登录二维码」，用哔哩哔哩手机客户端扫描并确认，再点一次「查找失效视频」。`access_key` 只留在当前标签页的 sessionStorage。

## 导出文件放哪

「导出全部视频」会把该收藏夹的 CSV 和 JSON 写进 `backups/收藏夹名-media_id/`，同时触发浏览器下载。`backups/` 里除了 `.gitkeep` 以外都已在 `.gitignore` 中忽略。仓库可以公开阅读，但不要提交 SESSDATA、Cookie、access_key，或用户导出的收藏夹备份。`.gitignore` 会忽略 `*SESSDATA*` 和 `*.cookie`。用完自己的私密数据后，请把仓库改回私密。
