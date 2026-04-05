<div align="center">

# ExEcho

### Zero-install alternative to ex-skill / 前任.skill — just open the webpage

**Clone your ex's texting style from chat history into an AI persona prompt**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Zero Backend](https://img.shields.io/badge/Backend-None-brightgreen.svg)](#)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Browser-blue.svg)](#)
[![No Install](https://img.shields.io/badge/Install-None-orange.svg)](#)

[Live Demo](https://duck-ai-yy.github.io/execho) | [中文](./README.md)

</div>

---

> *Not to go back, but to see clearly.*

## How is this different from ex-skill?

| | ExEcho | ex-skill (前任.skill) |
|---|---|---|
| **Setup** | Open a webpage | Install Claude Code |
| **For** | Everyone (non-technical friendly) | Developers |
| **Privacy** | 100% browser-side, zero upload | Data goes through LLM API |
| **Cost** | Completely free | Requires API credits |
| **Input** | Screenshot OCR / paste text | Chat file import |
| **Output** | Copyable Prompt + 5D report | Claude Skill |

**If you're not a developer, or just want to try it quickly, ExEcho is the easier choice.**

Upload WeChat screenshots or paste chat text. ExEcho analyzes the texting style and generates a persona prompt. Paste it into any free AI (ChatGPT, Kimi, Claude) to chat with your ex's digital clone.

## Features

- **Screenshot OCR** — Upload WeChat screenshots, browser-based OCR identifies text and speakers
- **Text Paste** — Paste exported chat history, supports 4 common formats
- **5-Dimension Analysis** — Warmth / Responsiveness / Expressiveness / Engagement / Compatibility
- **Digital Clone Prompt** — One-click generate, paste into any AI
- **Share Image** — Privacy-safe score card for social sharing
- **Bilingual** — Chinese & English, auto-detected

## Privacy

- 100% browser-side processing, zero network requests
- No backend, no database, no tracking
- Fully open source — audit the code yourself
- Close the tab, all data is gone

## Quick Start

```bash
git clone https://github.com/duck-ai-yy/execho.git
cd execho
python3 -m http.server 8080
# Open http://localhost:8080
```

Or just visit the [Live Demo](https://duck-ai-yy.github.io/execho).

## How It Works

1. **Input** — Upload WeChat screenshots (OCR) or paste chat text
2. **Parse** — Identify speakers using spatial position (screenshots) or text format detection
3. **Analyze** — Compute 5 communication dimensions from vocabulary, emoji, timing, topics
4. **Generate** — Create a detailed persona prompt capturing the ex's texting style
5. **Chat** — Paste the prompt into any free AI to talk with the digital clone

## Tech Stack

Pure HTML/CSS/JS. No framework, no build tools, no backend. Tesseract.js for browser-side Chinese OCR. Hosted free on GitHub Pages.

## License

[MIT](LICENSE)
