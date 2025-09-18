# Automation Control Center

A secure automation console that orchestrates the full lifecycle for YouTube ingestion. The React
front-end (served from GitHub Pages) authenticates with GitHub OAuth device flow and triggers a
suite of GitHub Actions that download audio, transcribe with Parakeet, segment calls, translate via
OpenRouter and keep the repository database up to date.

> **Security first** – the UI refuses to load sensitive data until the signed-in GitHub user matches
> the whitelisted login and all workflow invocations happen through repository dispatch events that
> execute exclusively inside GitHub Actions with repository secrets.

---

## Repository layout

```text
├── src/                 # TypeScript source used for local development
├── docs/                # Pre-built static bundle published with GitHub Pages
├── public/              # Static assets (favicon etc.)
├── scripts/             # GitHub Actions helper scripts (Python)
├── data/                # Workflow artefacts organised per video
├── db/index.json        # State database consumed by the dashboard
└── .github/workflows/   # Repository_dispatch workflows for every step
```

---

## Front-end

### Local development

1. Install Node.js 18+ and enable pnpm/npm.
2. Copy `.env.example` (create one if necessary) or export the required variables:
   ```bash
   VITE_GITHUB_CLIENT_ID=<your-oauth-app-client-id>
   VITE_ALLOWED_GH_LOGIN=ALLOWED_GH_LOGIN
   VITE_REPO_OWNER=<repo-owner>
   VITE_REPO_NAME=<repo-name>
   VITE_DEFAULT_BRANCH=main
   ```
3. Install dependencies and run the dev server:
   ```bash
   npm install
   npm run dev
   ```
4. The application boots at `http://localhost:5173` and proxies GitHub device flow directly.

> **Note:** `npm install`/`npm run build` could not be executed in this environment because outbound
> access to the npm registry is blocked. Run the commands locally to verify before publishing.

### Production bundle (docs/)

The repository is configured to publish `docs/` to GitHub Pages. Because we cannot rely on a build
step inside GitHub Pages, a hand-crafted ES module bundle lives at `docs/assets/index.js` and uses
CDN hosted ESM imports (`esm.sh`). React components are re-written with `htm` template literals to
avoid a transpilation requirement.

Configuration values are read from `window.__APP_CONFIG__`. Update the bootstrap block inside
`docs/index.html` (or serve a separate `config.js`) with the values for your deployment:

```html
<script>
  window.__APP_CONFIG__ = {
    VITE_GITHUB_CLIENT_ID: 'Iv1...',
    VITE_ALLOWED_GH_LOGIN: 'ALLOWED_GH_LOGIN',
    VITE_REPO_OWNER: 'your-org',
    VITE_REPO_NAME: 'automation-repo',
    VITE_DEFAULT_BRANCH: 'main',
    VITE_PUBLIC_BASE: '/automation-repo/' // required when hosting under a sub-path
  };
</script>
```

The rest of the UI mirrors the TypeScript source – Auth and Data providers, dashboard, analytics,
subtitle preview, bulk tools and rollback options.

### OAuth device flow

1. Register a GitHub OAuth App (Device Flow enabled). Homepage can be the Pages URL.
2. Copy the **Client ID** into `window.__APP_CONFIG__` and `.env.local` for local work.
3. No client secret is needed on the frontend – device flow completes entirely in the GitHub API.
4. Only the GitHub login matching `VITE_ALLOWED_GH_LOGIN` can finish sign-in; everyone else gets
   a "Access denied" error immediately after GitHub reports their identity.

---

## Backend automation (GitHub Actions)

All automation is triggered by `repository_dispatch` events. The React UI sends authenticated REST
calls to `POST /repos/:owner/:repo/dispatches` using the signed-in user token. Each workflow checks
out the repo, runs a Python helper and commits changes back to `db/index.json` plus generated
artefacts.

### Dispatch events and payloads

| Workflow        | Event type       | Required payload fields                               |
| --------------- | ---------------- | ------------------------------------------------------ |
| Download audio  | `download`       | `videoId`, `sourceUrl`, optional `channelId`           |
| Transcribe      | `transcribe`     | `videoId`, optional `audioPath`                        |
| Split calls     | `split`          | `videoId`                                             |
| Translate       | `translate`      | `videoId`, `language` (`ar` or `tr`)                   |
| Delete assets   | `delete`         | `videoId`                                             |
| Reset step      | `reset-step`     | `videoId`, `resetStep` (e.g. `download`, `split`)      |

The UI automatically fills `requestedBy` with the GitHub login triggering the action so the audit
history remains traceable.

### Secrets

| Secret name          | Used by                  | Purpose                                |
| -------------------- | ------------------------ | -------------------------------------- |
| `PARAKEET_API_URL`   | `transcribe.yml`         | Base URL for Parakeet-TDT service/API  |
| `PARAKEET_API_KEY`   | `transcribe.yml`         | Authentication token for Parakeet      |
| `OPENROUTER_API_KEY` | `translate.yml`          | OpenRouter API key                     |
| `OPENROUTER_MODEL`   | `translate.yml`          | Optional override for translation LLM  |

All secrets stay inside the GitHub runner; nothing is exposed to the front-end.

### Helper scripts (Python)

| Script                | Description                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `download.py`         | Uses `yt-dlp` to pull audio into `data/<video>/audio/` and updates metadata in the DB.       |
| `transcribe.py`       | Runs Parakeet locally/API, stores the `.srt`, captures runtime/engine details.               |
| `split.py`            | Detects call segments, writes `calls.jsonl`, generates per-part SRTs and summaries.          |
| `translate.py`        | Sends subtitles to OpenRouter for Arabic/Turkish translation, records token usage.           |
| `delete.py`           | Removes artefacts for a video, cleans DB entries and history trail.                          |
| `reset_step.py`       | Resets status for a step so a workflow can be re-run (rollback helper).                      |
| `common.py`           | Shared helpers: DB loading/saving, analytics computation, history logging, etc.              |

Install dependencies in CI via `pip install -r scripts/requirements.txt`. The requirements include
`yt-dlp`, `requests`, `tiktoken`, etc., so run inside GitHub-hosted runners for consistent binaries.

### Data layout

Each video lives under `data/<video_id>/`:

```
├── audio/            # yt-dlp output
├── parts/            # Split call artefacts (SRT and calls.jsonl)
├── translations/     # Localised SRT files per language
└── <video_id>.srt    # Primary transcription output
```

`db/index.json` tracks per-step statuses, timestamps, analytics and workflow history. The React UI
pulls this file via the GitHub API and renders the dashboard.

### Triggering workflows manually

Use a personal access token with `repo` scope and call the dispatch endpoint:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <PAT>" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{"event_type":"download","client_payload":{"videoId":"abc123","sourceUrl":"https://youtu.be/..."}}'
```

---

## Deployment to GitHub Pages

1. Ensure `docs/` is committed (already included in this repo). GitHub Pages should be configured to
   serve from the `/docs` folder in repository settings.
2. Update `docs/index.html` config block with real values. For sub-path hosting set
   `VITE_PUBLIC_BASE` to `/your-repo/`.
3. Optional: add a workflow to rebuild the bundle locally with Vite (`npm run build`) and commit
   changes before pushing.

Because the bundle fetches dependencies at runtime from `esm.sh`, there are no client secrets nor
bundled Node modules in the published assets.

---

## Testing & linting

Run locally after installing dependencies:

```bash
npm run lint
npm run build
```

and for scripts:

```bash
pip install -r scripts/requirements.txt
pytest  # if you add tests
```

The automated environment here cannot reach the npm registry, so these commands were not executed in
this run.

---

## Troubleshooting

- **Device flow never completes** – check that the OAuth app is configured for device flow and the
  authenticated GitHub user matches `VITE_ALLOWED_GH_LOGIN`.
- **`repository_dispatch` returns 404/401** – the signed-in user token must have `repo` scope and the
  repo settings must allow Actions to create commits.
- **GitHub Pages routing** – set `VITE_PUBLIC_BASE` so the router works under subdirectories.
- **Workflow stuck** – use the "Reset Step" dropdown in the video detail page (triggers
  `reset-step`) and re-run from there.

Enjoy the automated localisation pipeline!
