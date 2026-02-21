# API Testing Env

## Host Local
1. Copy `apps/api/.env.test.example` to `apps/api/.env.test`.
2. Run tests from host:
`pnpm --filter @eiah/api test`

By default, outside Docker, Vitest will load `apps/api/.env.test` with override.

## Docker
Inside containers, Vitest keeps Docker service DNS defaults (`eiah-postgres`, `eiah-redis`).

## CI / Custom
Set `VITEST_ENV_FILE` to force a specific env file relative to `apps/api`:
`VITEST_ENV_FILE=.env.ci pnpm --filter @eiah/api test`
