// =============================================================================
// EDGE FUNCTION: openapi-spec
// AUTO-GERADO por scripts/generate-openapi.ts — NÃO EDITE À MÃO.
// Fonte de verdade: src/lib/endpoints-catalog.ts
//
// Self-contained: o spec está inline abaixo para compatibilidade com o deploy
// via dashboard do Supabase (que faz upload apenas do index.ts, sem arquivos
// auxiliares).
// =============================================================================

// deno-lint-ignore-file no-explicit-any
/* eslint-disable */

const spec = {
  "openapi": "3.1.0",
  "info": {
    "title": "Zailom Booking — Public API",
    "version": "1.0.0",
    "description": "API pública do Zailom Booking. Todos os endpoints requerem uma API key vinculada a uma empresa, enviada via header `Authorization: Bearer zlm_...` ou `x-api-key`.",
    "contact": {
      "name": "Zailom Booking",
      "url": "https://booking.zailom.com"
    }
  },
  "servers": [
    {
      "url": "https://api-booking.zailom.com/v1",
      "description": "Produção"
    }
  ],
  "tags": [
    {
      "name": "Serviços"
    },
    {
      "name": "Colaboradores"
    },
    {
      "name": "Disponibilidade (SSOT)"
    },
    {
      "name": "Clientes"
    },
    {
      "name": "Agendamentos"
    },
    {
      "name": "Pagamentos"
    },
    {
      "name": "Notificações"
    }
  ],
  "components": {
    "securitySchemes": {
      "BearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "API Key",
        "description": "Envie sua API key como Bearer token."
      },
      "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "x-api-key",
        "description": "Alternativa ao Authorization Bearer."
      }
    }
  },
  "paths": {
    "/services": {
      "get": {
        "tags": [
          "Serviços"
        ],
        "summary": "Listar serviços",
        "description": "Retorna todos os serviços ativos da empresa vinculada à API key.",
        "operationId": "list_services",
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": [
                  {
                    "id": "uuid",
                    "name": "Corte masculino",
                    "duration_minutes": 30,
                    "price": 50
                  }
                ]
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/services/{id}": {
      "get": {
        "tags": [
          "Serviços"
        ],
        "summary": "Detalhes do serviço",
        "description": "Retorna os detalhes completos de um serviço.",
        "operationId": "get_service",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "id": "uuid",
                  "name": "Corte masculino",
                  "duration_minutes": 30,
                  "price": 50
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/services/{id}/employees": {
      "get": {
        "tags": [
          "Serviços"
        ],
        "summary": "Profissionais do serviço",
        "description": "Lista profissionais habilitados a executar o serviço.",
        "operationId": "service_employees",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": [
                  {
                    "id": "uuid",
                    "name": "João"
                  }
                ]
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/employees": {
      "get": {
        "tags": [
          "Colaboradores"
        ],
        "summary": "Listar colaboradores",
        "description": "Lista colaboradores ativos. Filtre por serviço com `service_id`.",
        "operationId": "list_employees",
        "parameters": [
          {
            "name": "service_id",
            "in": "query",
            "required": false,
            "description": "Filtra por serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": [
                  {
                    "id": "uuid",
                    "name": "João",
                    "role": "Barbeiro"
                  }
                ]
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/employees/{id}/busy": {
      "get": {
        "tags": [
          "Colaboradores"
        ],
        "summary": "Agenda ocupada",
        "description": "Retorna os agendamentos ativos do colaborador num intervalo.",
        "operationId": "employee_busy",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID do colaborador",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "from",
            "in": "query",
            "required": true,
            "description": "Data inicial (YYYY-MM-DD)",
            "schema": {
              "type": "string",
              "format": "date"
            }
          },
          {
            "name": "to",
            "in": "query",
            "required": true,
            "description": "Data final (YYYY-MM-DD)",
            "schema": {
              "type": "string",
              "format": "date"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": [
                  {
                    "id": "uuid",
                    "booking_date": "2026-07-10",
                    "start_time": "14:00",
                    "end_time": "14:30"
                  }
                ]
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/availability/dates": {
      "get": {
        "tags": [
          "Disponibilidade (SSOT)"
        ],
        "summary": "Dias disponíveis",
        "description": "Retorna todos os dias no intervalo que possuem ao menos 1 horário livre. Respeita escala, ausências, bloqueios e configurações da empresa.",
        "operationId": "availability_dates",
        "parameters": [
          {
            "name": "employee_id",
            "in": "query",
            "required": true,
            "description": "ID do colaborador",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "service_id",
            "in": "query",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "from",
            "in": "query",
            "required": true,
            "description": "Data inicial",
            "schema": {
              "type": "string",
              "format": "date"
            }
          },
          {
            "name": "to",
            "in": "query",
            "required": true,
            "description": "Data final",
            "schema": {
              "type": "string",
              "format": "date"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": [
                  "2026-07-10",
                  "2026-07-11",
                  "2026-07-14"
                ]
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/availability/slots": {
      "get": {
        "tags": [
          "Disponibilidade (SSOT)"
        ],
        "summary": "Horários disponíveis no dia",
        "description": "Lista horários livres para um serviço/colaborador num dia específico.",
        "operationId": "availability_slots",
        "parameters": [
          {
            "name": "employee_id",
            "in": "query",
            "required": true,
            "description": "ID do colaborador",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "service_id",
            "in": "query",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "date",
            "in": "query",
            "required": true,
            "description": "Data (YYYY-MM-DD)",
            "schema": {
              "type": "string",
              "format": "date"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": [
                  "09:00",
                  "09:30",
                  "10:00",
                  "14:30"
                ]
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/availability/next": {
      "get": {
        "tags": [
          "Disponibilidade (SSOT)"
        ],
        "summary": "Próximo horário livre",
        "description": "Encontra o próximo horário livre dentro de 60 dias.",
        "operationId": "availability_next",
        "parameters": [
          {
            "name": "employee_id",
            "in": "query",
            "required": true,
            "description": "ID do colaborador",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "service_id",
            "in": "query",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "date": "2026-07-10",
                  "time": "09:00"
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/clients": {
      "get": {
        "tags": [
          "Clientes"
        ],
        "summary": "Buscar cliente por telefone",
        "description": "Localiza um cliente pelo WhatsApp/telefone (E.164 ou nacional).",
        "operationId": "find_client",
        "parameters": [
          {
            "name": "phone",
            "in": "query",
            "required": true,
            "description": "Ex.: 5511999998888",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "id": "uuid",
                  "name": "Maria",
                  "phone": "5511999998888"
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Clientes"
        ],
        "summary": "Criar/atualizar cliente",
        "description": "Faz upsert por telefone. Ideal para o fluxo do WhatsApp.",
        "operationId": "upsert_client",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "name",
                  "phone"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "description": "Nome do cliente"
                  },
                  "phone": {
                    "type": "string",
                    "description": "Telefone/WhatsApp"
                  },
                  "email": {
                    "type": "string",
                    "description": "E-mail opcional"
                  }
                }
              },
              "example": {
                "name": "Maria",
                "phone": "5511999998888"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "id": "uuid",
                  "name": "Maria",
                  "phone": "5511999998888"
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/clients/{clientId}/bookings": {
      "get": {
        "tags": [
          "Clientes"
        ],
        "summary": "Agendamentos do cliente",
        "description": "Lista agendamentos passados/futuros do cliente.",
        "operationId": "client_bookings",
        "parameters": [
          {
            "name": "clientId",
            "in": "path",
            "required": true,
            "description": "ID do cliente",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "scope",
            "in": "query",
            "required": false,
            "description": "upcoming | past | all (default: all)",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": [
                  {
                    "id": "uuid",
                    "booking_date": "2026-07-10",
                    "start_time": "14:00",
                    "status": "confirmed"
                  }
                ]
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/bookings": {
      "post": {
        "tags": [
          "Agendamentos"
        ],
        "summary": "Criar agendamento",
        "description": "Cria um agendamento. Para bots, envie sempre `booking_date` + `booking_time` como fonte única; evite campos genéricos como `data`, `date`, `time` e não envie `start_time` ISO.",
        "operationId": "create_booking",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "client_id",
                  "service_id",
                  "employee_id",
                  "booking_date",
                  "booking_time"
                ],
                "properties": {
                  "client_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do cliente"
                  },
                  "service_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do serviço"
                  },
                  "employee_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do colaborador"
                  },
                  "booking_date": {
                    "type": "string",
                    "format": "date",
                    "description": "YYYY-MM-DD, ex.: 2026-07-15"
                  },
                  "booking_time": {
                    "type": "string",
                    "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$",
                    "description": "HH:mm, ex.: 15:00"
                  }
                }
              },
              "example": {
                "client_id": "uuid",
                "service_id": "uuid",
                "employee_id": "uuid",
                "booking_date": "2026-07-15",
                "booking_time": "15:00"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "id": "uuid",
                  "status": "confirmed"
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/bookings/{id}": {
      "get": {
        "tags": [
          "Agendamentos"
        ],
        "summary": "Consultar agendamento",
        "description": "Retorna os detalhes de um agendamento.",
        "operationId": "get_booking",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID do agendamento",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "id": "uuid",
                  "status": "confirmed"
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/bookings/{id}/cancel": {
      "post": {
        "tags": [
          "Agendamentos"
        ],
        "summary": "Cancelar agendamento",
        "description": "Cancela um agendamento (respeita regras de imutabilidade).",
        "operationId": "cancel_booking",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID do agendamento",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [],
                "properties": {
                  "reason": {
                    "type": "string",
                    "description": "Motivo opcional"
                  }
                }
              },
              "example": {
                "reason": "Cliente solicitou via WhatsApp"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/bookings/{id}/reschedule": {
      "post": {
        "tags": [
          "Agendamentos"
        ],
        "summary": "Reagendar",
        "description": "Reagenda usando `client_reschedule_booking` — mesma fonte da UI.",
        "operationId": "reschedule_booking",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID do agendamento",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "new_date",
                  "new_time"
                ],
                "properties": {
                  "new_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Nova data"
                  },
                  "new_time": {
                    "type": "string",
                    "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$",
                    "description": "Novo horário"
                  }
                }
              },
              "example": {
                "new_date": "2026-07-11",
                "new_time": "15:00"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/payments/methods": {
      "get": {
        "tags": [
          "Pagamentos"
        ],
        "summary": "Formas de pagamento",
        "description": "Retorna as formas aceitas pela empresa.",
        "operationId": "payment_methods",
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": [
                  "pix",
                  "credit_card",
                  "cash"
                ]
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/payments": {
      "post": {
        "tags": [
          "Pagamentos"
        ],
        "summary": "Gerar cobrança",
        "description": "Gera cobrança para um agendamento (Pix / link de cartão).",
        "operationId": "create_payment",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "booking_id",
                  "method"
                ],
                "properties": {
                  "booking_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do agendamento"
                  },
                  "method": {
                    "type": "string",
                    "description": "pix | credit_card"
                  }
                }
              },
              "example": {
                "booking_id": "uuid",
                "method": "pix"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "id": "uuid",
                  "qr_code": "00020126...",
                  "status": "pending"
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/notifications": {
      "post": {
        "tags": [
          "Notificações"
        ],
        "summary": "Disparar notificação",
        "description": "Solicita envio de notificação. Eventos `booking.*` disparam automaticamente `notify-booking-change`.",
        "operationId": "send_notification",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "event"
                ],
                "properties": {
                  "event": {
                    "type": "string",
                    "description": "Ex.: booking.created"
                  },
                  "booking_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Se evento de booking"
                  }
                }
              },
              "example": {
                "event": "booking.created",
                "booking_id": "uuid"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "400": {
            "description": "Requisição inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "invalid_request",
                  "message": "Payload inválido ou parâmetros faltando."
                }
              }
            }
          },
          "401": {
            "description": "API key ausente/ inválida",
            "content": {
              "application/json": {
                "example": {
                  "error": "unauthorized"
                }
              }
            }
          },
          "403": {
            "description": "Escopo insuficiente",
            "content": {
              "application/json": {
                "example": {
                  "error": "forbidden"
                }
              }
            }
          },
          "404": {
            "description": "Recurso não encontrado",
            "content": {
              "application/json": {
                "example": {
                  "error": "not_found"
                }
              }
            }
          },
          "409": {
            "description": "Conflito (ex.: slot indisponível)",
            "content": {
              "application/json": {
                "example": {
                  "error": "slot_unavailable"
                }
              }
            }
          },
          "500": {
            "description": "Erro interno",
            "content": {
              "application/json": {
                "example": {
                  "error": "internal_error"
                }
              }
            }
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    }
  }
} as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type, apikey, accept",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SELF_URL = "https://api-booking.zailom.com/openapi/live";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const wantsYaml =
    url.pathname.endsWith(".yaml") ||
    url.pathname.endsWith(".yml") ||
    (req.headers.get("accept") || "").includes("yaml");

  if (wantsYaml) {
    return new Response(
      JSON.stringify({
        error: "use_json_endpoint",
        hint: "YAML disponível em booking.zailom.com/openapi.yaml (static).",
      }),
      {
        status: 406,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify(spec), {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "application/vnd.oai.openapi+json;version=3.1",
      "cache-control": "public, max-age=300",
      "link": `<${SELF_URL}>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
      "x-openapi-version": (spec as any)?.info?.version ?? "unknown",
    },
  });
});
