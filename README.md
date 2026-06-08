# Boundary Layer AI Research Agent

This repository is a Supabase-first research and analysis agent for the Boundary Layer platform. It mirrors the shape of `boudary-layer-ai-web-search`, but instead of doing web-citation research it focuses on querying the Boundary Layer database, surfacing portfolio-level insights, detecting data-quality issues, and answering internal research questions from the warehouse itself.

## What it does

The first version supports four repeatable analysis modes:

1. `portfolio-overview` - high-level portfolio counts, capacity, status mix, and country breakdowns
2. `data-quality` - missing metadata, capacity mismatches, and missing turbine-link coverage
3. `research-coverage` - research report coverage, high-value farms without reports, and fact conflicts
4. `priority-targets` - a combined queue of the most useful next research and data-cleanup targets

It also supports an `ask` workflow that routes a free-form internal question to the most relevant analysis packs and, when AI is enabled, synthesizes a markdown answer from those SQL-derived results.

## Repo shape

The repo intentionally follows the same operating model as `boudary-layer-ai-web-search`:

- Node 20 CLI workflows
- thin direct Postgres client over `DATABASE_URL`
- explicit prompt files for optional AI synthesis
- file-based artifacts under `reports/`
- small internal HTTP service for server-side triggering

For a Hermes deployment, this repo should be the only process with database credentials. Hermes talks to it over loopback HTTP with a service token, so the orchestration layer can analyze Boundary Layer data without holding raw Supabase access.

## Suggested architecture

```text
Supabase core_* tables
        |
        v
boundary-layer-ai-research-agent
        |
        +--> deterministic query packs
        +--> optional local AI synthesis
        +--> internal-only HTTP API on loopback
        |
        v
Hermes Agent on Hetzner
        |
        +--> OpenRouter-hosted Hermes model
        +--> Telegram gateway
```

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Set `DATABASE_URL` to a Supabase Postgres connection string. For a long-lived Hetzner VM, Supabase documents the direct connection as the preferred option when your network supports it; if your host is IPv4-only without the IPv4 add-on, use the session pooler instead:

- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO

Optional AI settings:

- `AI_PROVIDER=codex` plus `OPENAI_API_KEY`
- `AI_PROVIDER=openrouter` plus `OPENROUTER_API_KEY`
- `AI_PROVIDER=none` for deterministic SQL-only summaries

## Usage

List the available analyses:

```powershell
npm run insights -- --list-analyses
```

Run a portfolio summary:

```powershell
npm run insights -- --analysis portfolio-overview
```

Run a UK offshore quality pass:

```powershell
npm run insights -- --analysis data-quality --country "United Kingdom" --wind-farm-type "Offshore wind farm"
```

Run the combined priority queue with AI synthesis enabled:

```powershell
npm run insights -- --analysis priority-targets --ai-summary --provider codex
```

Ask an internal research question:

```powershell
npm run ask -- --question "Which offshore wind farms should we research next in Germany?" --country Germany --provider codex
```

Artifacts are saved by default into `reports/analysis` and `reports/questions`.

## HTTP service

Start the internal service:

```powershell
npm start
```

Endpoints:

1. `GET /healthz`
2. `POST /internal/run-analysis`
3. `POST /internal/ask-database`

If `RESEARCH_AGENT_SERVICE_TOKEN` is set, send it as `Authorization: Bearer <token>`.
For a Hermes deployment, bind this service to `127.0.0.1` and keep it off the public internet.

Example request:

```json
{
  "analysis": "priority-targets",
  "filters": {
    "country": "United Kingdom",
    "windFarmType": "Offshore wind farm"
  },
  "aiSummary": true,
  "provider": "codex"
}
```

## Hermes bridge usage

These commands are for a separate orchestration layer, such as Hermes Agent, that should not hold `DATABASE_URL` directly:

```powershell
npm run hermes:analysis -- --analysis priority-targets --country "United Kingdom"
npm run hermes:ask -- --question "What are the biggest UK offshore data issues right now?"
```

They call the internal HTTP service using:

- `BOUNDARY_LAYER_INTERNAL_URL` (defaults to `http://127.0.0.1:3002`)
- `BOUNDARY_LAYER_INTERNAL_TOKEN` or `RESEARCH_AGENT_SERVICE_TOKEN`

Add `--json` if you want the full structured result instead of markdown.

## GitHub and Hetzner

The rollout docs live here:

- [docs/REPO_PLAN.md](docs/REPO_PLAN.md)
- [docs/GITHUB_PUBLISH.md](docs/GITHUB_PUBLISH.md)
- [docs/DEPLOY_HETZNER.md](docs/DEPLOY_HETZNER.md)
- [docs/HERMES_HETZNER_SETUP.md](docs/HERMES_HETZNER_SETUP.md)

## Recommended first run

This is the fastest path to useful signal:

1. Run `portfolio-overview` on all active farms
2. Run `data-quality` for `United Kingdom` offshore farms
3. Run `research-coverage` for `United Kingdom` offshore farms
4. Run `priority-targets` with `--ai-summary` once you are happy with the raw query outputs

That gives you both broad monitoring and a concrete queue for the next research agent work.
