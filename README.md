# Chartpilot

**Chat with an agent on your own GitHub Copilot plan. It draws charts when they say more than words.**

Sign in with GitHub, ask anything, and the agent decides when a visual helps. It writes a self-contained HTML page, previews it in a headless browser, fixes what looks wrong, and publishes it inline above its reply.

![A Chartpilot reply: an "Animals take the podium" chart comparing cheetah, dung beetle and puma records with human world records](docs/chart.png)

## Features

- **Your own Copilot plan.** Users sign in with GitHub's device flow, the same "enter this code on github.com" flow OpenCode uses. Usage counts against each user's Copilot plan. The app holds no model API keys.
- **Charts without asking.** The agent has two tools, `html_preview` and `html_render`, ported from [T3 Code](https://github.com/pingdotgg/t3code)'s visuals feature. It previews each page as a screenshot before showing it, so it can catch its own layout bugs.
- **Themed, sandboxed visuals.** Pages render in a sandboxed iframe with the app's colours injected as CSS variables (`--chart-1` … `--chart-6` and more). Each frame grows to fit its page.
- **Model and effort pickers.** The composer has T3-style model and effort controls. The model list comes from the user's Copilot plan.
- **Streaming chat UI.** Built with shadcn/ui's chat components (MessageScroller, Message, Bubble, Marker) and Markdown replies.
- **No database.** The GitHub token lives in an encrypted, httpOnly cookie, and chats live in the page.

| Sign in | Starter questions | Model picker |
| --- | --- | --- |
| ![Connect GitHub Copilot screen](docs/connect.png) | ![Empty chat with starter questions](docs/home.png) | ![Model picker open in the composer](docs/model-picker.png) |

## How it works

```
Browser ──device flow──▶ GitHub OAuth App ──▶ user token (gho_…)
   │
   └──POST /api/chat──▶ Next.js route ──▶ @github/copilot-sdk (multi-user "empty" mode)
                            │                 ├─ html_preview → headless Chromium screenshot
                            │                 └─ html_render  → page streamed to the browser
                            └──NDJSON stream──▶ text deltas, status, rendered pages
```

- The server runs the [GitHub Copilot SDK](https://github.com/github/copilot-sdk), passing each user's token as `gitHubToken`, with `mode: "empty"` so no OS tools are exposed.
- `html_preview` uses [`@sparticuz/chromium-min`](https://github.com/Sparticuz/chromium) on Vercel and your local Chrome in development. The screenshot goes back to the model as an image.
- `html_render` streams the finished page to the browser. The client injects T3's theme bootstrap and shows the page in a `sandbox="allow-scripts allow-forms"` iframe.
- A heartbeat every 10 seconds keeps the stream active while the model writes a page, which can take a minute. Each turn logs its stages, memory use and disconnects (`[turn …]` lines in the server logs).

## Run it yourself

You need [Bun](https://bun.sh), a GitHub account with Copilot (the free tier works), and Google Chrome for local previews.

**1. Create a GitHub OAuth App** at [github.com/settings/applications/new](https://github.com/settings/applications/new):

- **Homepage URL:** your app's URL, or `http://localhost:3000`.
- **Authorization callback URL:** any URL. The device flow doesn't use it.
- **Tick "Enable Device Flow"**, then copy the Client ID. No client secret is needed.

**2. Configure and start:**

```bash
git clone https://github.com/JorgeMenaDev/chartpilot.git
cd chartpilot
bun install
cp .env.example .env.local   # set GITHUB_CLIENT_ID and SESSION_SECRET
bun run dev
```

| Variable | Purpose |
| --- | --- |
| `GITHUB_CLIENT_ID` | Client ID of your OAuth App (public, not a secret). |
| `SESSION_SECRET` | Encrypts the session cookie. Generate one with `openssl rand -hex 32`. |
| `CHROME_PATH` | Optional, local only. Path to Chrome for `html_preview`; defaults to macOS Google Chrome. |

**3. Deploy to Vercel:** import the repo and set the same two environment variables. The Copilot runtime (about 140 MB) ships inside the function, and Chromium downloads into `/tmp` on first use. Both fit within Vercel's function limits.

## Good to know

- **Copilot Free is Auto-only.** Copilot accepts a model switch, then still runs Free accounts on Auto, and effort has no effect. The picker shows other models as locked on Free. On paid plans it lists the plan's real models and each model's effort levels.
- **Tokens expire.** A GitHub OAuth App with "Expire user access tokens" issues 8-hour tokens. The session cookie expires with the token, and users reconnect after that.
- **Visuals take time.** A chart turn usually takes 40–75 seconds, mostly while the model writes the HTML.
- **Each turn starts a fresh Copilot session.** Earlier turns are replayed as a transcript, so serverless instances don't need shared state.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · GitHub Copilot SDK · Puppeteer + `@sparticuz/chromium-min` · Vercel

## Credits

The HTML visuals (theme bootstrap, tool contract, frame sizing) and the composer controls are adapted from [T3 Code](https://github.com/pingdotgg/t3code) by T3 Tools Inc., under the MIT licence. See [LICENSE](LICENSE).

## License

[MIT](LICENSE)
