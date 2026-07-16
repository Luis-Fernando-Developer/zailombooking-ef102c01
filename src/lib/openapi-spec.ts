// =============================================================================
// OPENAPI SPEC BUILDER
// Deriva um documento OpenAPI 3.1 a partir do catálogo de ENDPOINTS usado
// na página /api-docs. Mantém a UI custom como fonte de verdade e permite
// exportar a mesma informação em formato padrão (JSON/YAML) para consumo
// por Postman, Insomnia, Swagger UI, geradores de SDK, etc.
// =============================================================================

import yaml from "js-yaml";

export type OpenApiParamLocation = "path" | "query" | "body" | "header";

export interface OpenApiSourceParam {
  name: string;
  type: string;
  location: OpenApiParamLocation;
  required?: boolean;
  description: string;
  example?: string;
}

export interface OpenApiSourceEndpoint {
  id: string;
  group: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  title: string;
  description: string;
  params: OpenApiSourceParam[];
  bodyExample?: Record<string, unknown>;
  responseExample: unknown;
}

// Map a "raw" type string (uuid, date, time, string, enum, ...) to a JSON Schema
function mapType(rawType: string): Record<string, unknown> {
  const t = rawType.toLowerCase();
  if (t === "uuid") return { type: "string", format: "uuid" };
  if (t === "date") return { type: "string", format: "date" };
  if (t === "time") return { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" };
  if (t === "datetime" || t === "date-time") return { type: "string", format: "date-time" };
  if (t === "int" || t === "integer") return { type: "integer" };
  if (t === "number" || t === "float") return { type: "number" };
  if (t === "boolean" || t === "bool") return { type: "boolean" };
  if (t === "enum") return { type: "string" };
  return { type: "string" };
}

// Convert "/services/:id" -> "/services/{id}"
function toOpenApiPath(path: string): string {
  return path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
}

interface BuildSpecOptions {
  title?: string;
  version?: string;
  description?: string;
  baseUrl?: string;
}

export function buildOpenApiSpec(
  endpoints: OpenApiSourceEndpoint[],
  opts: BuildSpecOptions = {},
): Record<string, unknown> {
  const {
    title = "Zailom Booking — Public API",
    version = "1.0.0",
    baseUrl = "https://api-booking.zailom.com/v1",
    description = `API pública do Zailom Booking. Todos os endpoints requerem uma API key vinculada a uma empresa, enviada via header \`Authorization: Bearer zlm_...\` ou \`x-api-key\`.`,
  } = opts;

  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of endpoints) {
    const oaPath = toOpenApiPath(ep.path);
    const method = ep.method.toLowerCase();

    const parameters = ep.params
      .filter((p) => p.location === "path" || p.location === "query")
      .map((p) => ({
        name: p.name,
        in: p.location,
        required: p.location === "path" ? true : Boolean(p.required),
        description: p.description,
        schema: mapType(p.type),
        ...(p.example ? { example: p.example } : {}),
      }));

    const bodyParams = ep.params.filter((p) => p.location === "body");
    const requestBody =
      bodyParams.length > 0
        ? {
            required: bodyParams.some((p) => p.required),
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: bodyParams.filter((p) => p.required).map((p) => p.name),
                  properties: Object.fromEntries(
                    bodyParams.map((p) => [
                      p.name,
                      { ...mapType(p.type), description: p.description },
                    ]),
                  ),
                },
                ...(ep.bodyExample ? { example: ep.bodyExample } : {}),
              },
            },
          }
        : undefined;

    const responses: Record<string, unknown> = {
      "200": {
        description: "Sucesso",
        content: {
          "application/json": {
            example: ep.responseExample,
          },
        },
      },
      "400": { description: "Requisição inválida", content: { "application/json": { example: { error: "invalid_request", message: "Payload inválido ou parâmetros faltando." } } } },
      "401": { description: "API key ausente/ inválida", content: { "application/json": { example: { error: "unauthorized" } } } },
      "403": { description: "Escopo insuficiente", content: { "application/json": { example: { error: "forbidden" } } } },
      "404": { description: "Recurso não encontrado", content: { "application/json": { example: { error: "not_found" } } } },
      "409": { description: "Conflito (ex.: slot indisponível)", content: { "application/json": { example: { error: "slot_unavailable" } } } },
      "500": { description: "Erro interno", content: { "application/json": { example: { error: "internal_error" } } } },
    };

    paths[oaPath] = paths[oaPath] ?? {};
    (paths[oaPath] as Record<string, unknown>)[method] = {
      tags: [ep.group],
      summary: ep.title,
      description: ep.description,
      operationId: ep.id.replace(/[^a-zA-Z0-9_]/g, "_"),
      ...(parameters.length ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses,
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    };
  }

  const tags = Array.from(new Set(endpoints.map((e) => e.group))).map((g) => ({
    name: g,
  }));

  return {
    openapi: "3.1.0",
    info: {
      title,
      version,
      description,
      contact: { name: "Zailom Booking", url: "https://booking.zailom.com" },
    },
    servers: [{ url: baseUrl, description: "Produção" }],
    tags,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description: "Envie sua API key como Bearer token.",
        },
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Alternativa ao Authorization Bearer.",
        },
      },
    },
    paths,
  };
}

export function specToYaml(spec: Record<string, unknown>): string {
  return yaml.dump(spec, { noRefs: true, lineWidth: 120 });
}

export function specToJson(spec: Record<string, unknown>): string {
  return JSON.stringify(spec, null, 2);
}

export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
