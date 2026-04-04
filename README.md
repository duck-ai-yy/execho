<div align="center">

# ExEcho 前任回声

**用聊天记录，复活TA的说话方式**

Upload WeChat chats. Clone your ex's texting style. Paste into any AI.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Zero Backend](https://img.shields.io/badge/Backend-None-brightgreen.svg)](#)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Browser-blue.svg)](#)

[在线体验 Live Demo](https://duck-ai.me/execho) | [English](./README_EN.md)

</div>

---

> *不是为了回去，是为了看清。*

上传微信聊天截图或粘贴聊天记录，ExEcho 会分析TA的说话风格，生成一个"数字分身" Prompt。把这个 Prompt 粘贴到任意免费 AI（ChatGPT、Kimi、豆包、Claude），就能再次和TA的说话方式对话。

## 功能

- **截图识别** — 上传微信截图，浏览器端 OCR 自动识别文字和说话人
- **文字粘贴** — 直接粘贴导出的聊天记录，支持4种常见格式
- **五维分析** — 温暖度 / 回复速度 / 话痨指数 / 粘人指数 / 契合度
- **数字分身 Prompt** — 一键生成，复制到任意 AI 即可对话
- **分享图** — 生成不含隐私的得分分享图
- **中英双语** — 自动检测，一键切换

## 隐私承诺

- 100% 浏览器端处理，零网络请求
- 没有后端，没有数据库，没有追踪
- 完全开源，欢迎审计代码
- 关闭页面，所有数据消失

## 快速开始

1. 打开 [在线 Demo](https://duck-ai.me/execho)
2. 点击「上传截图」或「粘贴文字」
3. 选择你的前任是哪位
4. 查看分析报告和五维得分
5. 一键复制 Prompt，粘贴到任意 AI 开始对话

> 想先看看效果？点击「试试看 Demo」体验内置故事。

## 技术栈

| 技术 | 用途 |
|------|------|
| HTML / CSS / JS | 纯原生，零框架，零构建工具 |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 浏览器端中文 OCR |
| GitHub Pages | 免费静态托管 |

**零依赖安装，零构建步骤，零运维成本。**

## 本地运行

```bash
git clone https://github.com/duck-ai-yy/execho.git
cd execho
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 部署到 GitHub Pages

1. Fork 本仓库
2. 进入 Settings → Pages
3. Source 选择 `main` 分支，目录选 `/ (root)`
4. 保存，等待部署完成

## 工作原理

```
微信截图/文字 → OCR识别/格式解析 → 说话人分离 → 五维分析 → Prompt生成
                                                              ↓
                                              复制到 ChatGPT/Kimi/豆包/Claude
```

**OCR 空间定位**：利用微信固定布局（左侧=对方消息，右侧=自己消息），通过 Tesseract 返回的文字坐标自动识别说话人，无需 NLP。

**五维评分**：
- 温暖度 — 表情频率 + 称呼语 + 正面情绪词
- 回复速度 — 平均回复时间 + 主动发起率
- 话痨指数 — 消息长度 + 词汇丰富度
- 粘人指数 — 提问频率 + 话题多样性
- 契合度 — 综合加权

## 项目结构

```
execho/
├── index.html      # 单页应用
├── style.css       # 微信风格 UI
├── app.js          # 流程控制
├── ocr.js          # 截图 OCR + 空间定位
├── parser.js       # 聊天格式解析
├── analyzer.js     # 五维分析引擎
├── generator.js    # Prompt 生成器
├── i18n.js         # 中英双语
└── sample-data.js  # 内置 Demo 数据
```

## 贡献

欢迎 PR！尤其是：
- 更多聊天格式支持（QQ、Telegram、iMessage）
- OCR 准确率优化
- 更有趣的评分标签文案
- UI/UX 改进

## License

[MIT](LICENSE)

---

<div align="center">

**如果觉得有趣，给个 Star 吧 ⭐**

</div>
