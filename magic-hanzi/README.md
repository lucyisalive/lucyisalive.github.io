# 魔法闯关汉字游戏

## 线上版本与继续开发

- 旧版《汉字魔法门》：https://lucyisalive.github.io/ ，保留原样。
- 新版《魔法闯关汉字游戏》：https://lucyisalive.github.io/magic-hanzi/ 。
- 新旧版使用独立的学习记录和笔迹存储；新版不自动读取或迁移旧版数据。
- 在本仓库继续修改、构建并测试。网站由 `lucyisalive/lucyisalive.github.io` 仓库发布；将本仓库已提交的文件导出到网站仓库的 `magic-hanzi/` 子目录后提交推送。不要替换网站根目录文件。新版的后续更新保持同一个网址。


这是草药房独立试玩的开发副本。玩法和测试要求见 [项目说明](AGENTS.md) 与 [汉字魔法门基本机制](汉字魔法门_基本机制.md)。

- 草药房每正式通过一个字，就向烧杯滴入一种草药。十种加齐后喝下穿墙药水，穿过石墙到星象台。
- 星象台每正式通过一个字，夜空亮起一颗星。十颗星连成星座，再化为飞鸟。两关也可连续演示。
- 巫师袍按累计掌握字数晋级。黑袍 0、紫袍 300、绿袍 600、蓝袍 1,000、银袍 2,000、血袍 3,000。当前内置 92 个教材练习字。

## 运行与构建

需要 Node.js 运行构建脚本。用 Python 启动本机预览，打开 `http://127.0.0.1:8876/`。

```sh
node tools/build-page.cjs
python3 -m http.server 8876 --bind 127.0.0.1
```

离线单页包含场景、六枚袍子和现有 167 个字形。双击生成的文件可试玩。

```sh
mkdir -p work
node tools/build-offline-preview.cjs work/草药房与星象台试玩_六阶巫师袍.html
```

云端副本以本机存档模式启动。开发和测试使用内置字库或模拟学习数据。内置参考字形源自汉字书写器字形数据（Hanzi Writer Data），字形许可证见 [ARPHICPL.TXT](ARPHICPL.TXT)。

```sh
node tests/page-build.cjs
node tests/offline-startup.cjs
node tests/herbalist-room-integration.cjs
node tests/parent-priority.cjs
```

## 待确认的故事草案

1. **巨人厨房。** 星鸟把孩子送到海边。每次正式通过备好一样巨型食材。十样备齐后，巨人下锅煮鱼尾汤。孩子喝下一勺，长出鱼尾，可以游进海底集市。
2. **海底集市。** 每次正式通过让一只海螺唱出一个音。十音成曲，美人鱼循声而来，打开珊瑚门，指向通往山谷的海洞。
3. **深渊断桥。** 孩子从海洞上岸，正前方的桥只剩绳索。每次正式通过飞回一块桥板。十块板铺好后，孩子过桥，看见山谷里的小车站。

先与家长对定每关故事，再进入制作。
