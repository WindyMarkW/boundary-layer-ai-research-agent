# Deploy on Hetzner

This guide assumes you meant a Hetzner VM or Hetzner-hosted agent box.

## Option 1: Docker Compose

1. Provision a VM with Docker and Compose
2. Clone the repo
3. Create `.env`
4. Start the service:

```bash
docker compose -f docker-compose.hetzner.yml up -d --build
```

The service listens on port `3002` by default.

## Option 2: systemd service

Example unit file is included at:

- [deploy/systemd/boundary-layer-ai-research-agent.service](../deploy/systemd/boundary-layer-ai-research-agent.service)

Typical layout:

- repo at `/opt/boundary-layer-ai-research-agent`
- env file at `/etc/boundary-layer-ai-research-agent.env`
- service user `blagent`

## Minimal server checklist

1. Install Node 20+
2. Install dependencies with `npm install --omit=dev`
3. Add `DATABASE_URL`
4. Add `RESEARCH_AGENT_SERVICE_TOKEN`
5. Optionally add `OPENAI_API_KEY` and set `AI_PROVIDER=codex`
6. Start with `npm start`

## Triggering runs remotely

Example:

```bash
curl -X POST http://<host>:3002/internal/run-analysis \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"analysis":"priority-targets","aiSummary":true,"provider":"codex"}'
```

## Recommended first automation

Run these daily:

1. `portfolio-overview`
2. `data-quality` for UK offshore farms
3. `research-coverage` for UK offshore farms

Then run `priority-targets` after those complete so the AI summary works from the freshest packs.
