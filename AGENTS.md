# Boundary Layer Agent Rules

This workspace is the protected Boundary Layer data-access layer.

## Required workflow

1. Do not use direct database credentials or ad hoc SQL for routine analysis tasks.
2. Use the local bridge commands instead:
   - `npm run hermes:analysis -- --analysis <name> [filters]`
   - `npm run hermes:ask -- --question "<question>" [filters]`
3. Treat the returned output as the grounded dataset response, then summarize or compare it for the user.

## Available repeatable analyses

- `portfolio-overview`
- `data-quality`
- `research-coverage`
- `priority-targets`

## Safety

- The internal API should stay on `127.0.0.1`.
- Hermes must not receive `DATABASE_URL`.
- If a bridge command fails with `Unauthorized`, check `BOUNDARY_LAYER_INTERNAL_TOKEN`.
