---
name: boundary-layer-research
description: Query Boundary Layer research data through the protected local API instead of using direct database credentials.
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [boundary-layer, supabase, research, telegram]
    category: research
    requires_toolsets: [terminal]
---

# Boundary Layer Research

## When to Use

Use this skill whenever the user asks about wind-farm portfolio status, research gaps, data-quality issues, or target prioritization for the Boundary Layer dataset.

## Rules

1. Never use direct database credentials, `psql`, or ad hoc SQL for Boundary Layer questions.
2. Always go through the local Boundary Layer proxy repo at `/opt/boundary-layer-ai-research-agent`.
3. Prefer deterministic query packs first, then summarize the results in your own words.
4. If the user asks a broad question, use `hermes:ask`. If they ask for a specific report, use `hermes:analysis`.

## Procedure

1. Change into the repo:

```bash
cd /opt/boundary-layer-ai-research-agent
```

2. For repeatable reports, run one of:

```bash
npm run hermes:analysis -- --analysis portfolio-overview
npm run hermes:analysis -- --analysis data-quality --country "United Kingdom" --wind-farm-type "Offshore wind farm"
npm run hermes:analysis -- --analysis research-coverage --country Germany
npm run hermes:analysis -- --analysis priority-targets --country "United Kingdom" --wind-farm-type "Offshore wind farm"
```

3. For free-form questions, run:

```bash
npm run hermes:ask -- --question "What are the biggest UK offshore data issues right now?"
```

4. If you need structured output for follow-on reasoning, add `--json`.

## Available Analyses

- `portfolio-overview`: portfolio counts, capacity, and status mix
- `data-quality`: missing metadata, conflicts, and suspicious mismatches
- `research-coverage`: report coverage and high-value missing research
- `priority-targets`: next-best research and cleanup queue

## Verification

1. Confirm the command returns markdown or JSON without authentication errors.
2. If the proxy reports `Unauthorized`, check that `BOUNDARY_LAYER_INTERNAL_TOKEN` is available in the Hermes environment.
3. If the proxy reports connection errors, verify the local service is running:

```bash
systemctl status boundary-layer-ai-research-agent
curl -s http://127.0.0.1:3002/healthz
```
