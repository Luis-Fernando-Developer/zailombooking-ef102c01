# openapi-spec — Edge Function

Serve o documento OpenAPI 3.1 da API pública em uma URL pública com CORS.

## Deploy manual

```bash
# 1. (Re)gera o spec embarcado (spec.json) a partir do catálogo
bun run scripts/generate-openapi.ts

# 2. Deploy da edge function (sem verify_jwt — endpoint público)
supabase functions deploy openapi-spec --no-verify-jwt
```

> A entrada em `supabase/config.toml` deve conter:
> ```toml
> [functions.openapi-spec]
> verify_jwt = false
> ```

## Endpoints públicos

- `https://<project>.supabase.co/functions/v1/openapi-spec` — direto na edge.
- `https://api-booking.zailom.com/openapi/live` — via Traefik + nginx (proxy no stack `api-booking`).

## Descoberta (discovery)

1. Arquivo estático (source of truth para tools):
   - `https://booking.zailom.com/openapi.json`
   - `https://booking.zailom.com/openapi.yaml`
   - `https://booking.zailom.com/.well-known/openapi.json` (RFC 8615)
2. Live (mesma info, sempre fresh):
   - `https://api-booking.zailom.com/openapi/live`
3. Header HTTP em toda resposta desta função:
   - `Link: <https://api-booking.zailom.com/openapi/live>; rel="service-desc"`
4. HTML em `booking.zailom.com`:
   - `<link rel="describedby" type="application/vnd.oai.openapi+json" href="/openapi.json">`

## Regenerar quando os endpoints mudarem

Toda vez que alterar `src/lib/endpoints-catalog.ts`:

```bash
bun run scripts/generate-openapi.ts   # atualiza public/ + spec.json embarcado
supabase functions deploy openapi-spec --no-verify-jwt
```
