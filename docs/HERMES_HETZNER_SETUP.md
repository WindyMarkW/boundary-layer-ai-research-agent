# Hermes + Boundary Layer on Hetzner

This deployment pattern keeps Supabase credentials inside `boundary-layer-ai-research-agent` and lets Hermes access Boundary Layer data only through the local internal API.

## Target service split

1. `boundary-layer-ai-research-agent.service`
   - owns `DATABASE_URL`
   - binds to `127.0.0.1:3002`
   - exposes `/internal/run-analysis` and `/internal/ask-database`
2. `hermes-gateway.service`
   - owns `OPENROUTER_API_KEY` and `TELEGRAM_BOT_TOKEN`
   - does not receive `DATABASE_URL`
   - calls the repo through `npm run hermes:analysis` and `npm run hermes:ask`

## Required Hermes environment

```bash
OPENROUTER_API_KEY=...
TELEGRAM_BOT_TOKEN=...
BOUNDARY_LAYER_INTERNAL_URL=http://127.0.0.1:3002
BOUNDARY_LAYER_INTERNAL_TOKEN=...
```

## Recommended rollout order

1. Lock the Boundary Layer service to loopback.
2. Install Hermes under its own unprivileged user.
3. Copy the `deploy/hermes/skills/boundary-layer-research` skill into `~/.hermes/skills/`.
4. Configure Hermes to use OpenRouter.
5. Start the Hermes gateway with Telegram enabled.
6. Verify a Telegram request can reach Hermes, trigger the skill, hit the local proxy, and return a grounded answer.

## Safety notes

- Do not place `DATABASE_URL` in the Hermes environment.
- Do not expose port `3002` publicly.
- Keep Telegram access restricted with `TELEGRAM_ALLOWED_USERS` or Hermes DM pairing.
- Once Hermes is verified, retire the older `openai-agent.service` and `telegram-agent.service`.
