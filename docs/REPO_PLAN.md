# Repo Plan

## Goal

Build a repo that an AI agent can use to analyze Boundary Layer's Supabase database in a repeatable, server-friendly way.

## Why a separate repo

`boundary-layer-processing` owns ingestion and schema.
`boudary-layer-ai-web-search` owns web-backed research.
This repo should own internal analytical reasoning over the data already in Supabase.

That separation keeps responsibilities clean:

- processing repo = source ingestion and publish
- web-search repo = external evidence gathering
- research-agent repo = internal analysis, prioritization, and monitoring

## First release shape

### Inputs

- `core_wind_farms`
- `core_turbines`
- `core_wind_farm_turbine_links`
- optional research tables when present:
  - `research_wind_farm_reports`
  - `wind_farm_facts`
  - `wind_farm_community_notes`

### Outputs

- markdown summaries in `reports/analysis`
- question answers in `reports/questions`
- JSON analysis packs for later app/API integration
- internal HTTP endpoints for server-side orchestration

### Initial workflows

1. `portfolio-overview`
2. `data-quality`
3. `research-coverage`
4. `priority-targets`
5. `ask-database`

## Suggested next phase

After the repo is stable, the next sensible additions are:

1. Persist analysis runs back into Supabase in dedicated `agent_analysis_runs` tables
2. Add cron-triggered daily insight runs on Hetzner
3. Expose latest run summaries to `boundary-layer-app`
4. Add more targeted packs like `country-brief`, `moderation-queue`, and `research-regression-check`

## Naming assumption

This scaffold uses `boundary-layer-ai-research-agent` as the repo name.
If you want a different name, the folder and package metadata are easy to rename.
