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
    "description": "API REST pública do Zailom Booking. Todos os endpoints requerem uma API key vinculada a uma empresa, enviada via header `Authorization: Bearer zlm_...` ou `x-api-key`. Os parâmetros de rota usam nomes semânticos no padrão OpenAPI, por exemplo `/services/{service_id}/employees`. Para integrações que usam templates, o mesmo endereço pode ser representado como `/v1/services/{{service_id}}/employees`; a ferramenta consumidora resolve o placeholder para o ID real antes de enviar a requisição HTTP. Essa convenção é independente de qualquer produto de automação e não exige que o consumidor seja o Zailom Flow.",
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
      "name": "Reservas temporárias"
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
        "x-integration-template": "/v1/services",
        "x-business-variables": [],
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
    "/services/{service_id}": {
      "get": {
        "tags": [
          "Serviços"
        ],
        "summary": "Detalhes do serviço",
        "description": "Retorna os detalhes completos do serviço identificado por service_id no contexto da empresa vinculada à API key. Use o ID retornado por GET /services; não use o nome do serviço como identificador.",
        "x-integration-template": "/v1/services/{{service_id}}",
        "x-business-variables": [
          {
            "name": "service_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID do serviço",
            "template": "{{service_id}}"
          }
        ],
        "operationId": "get_service",
        "parameters": [
          {
            "name": "service_id",
            "in": "path",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "service_id",
            "x-template-placeholder": "{{service_id}}",
            "example": "00000000-0000-0000-0000-000000000000"
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
    "/services/{service_id}/employees": {
      "get": {
        "tags": [
          "Serviços"
        ],
        "summary": "Profissionais do serviço",
        "description": "Lista os profissionais ativos habilitados a executar o serviço identificado por service_id. O valor deve ser o ID real retornado por GET /services.",
        "x-integration-template": "/v1/services/{{service_id}}/employees",
        "x-business-variables": [
          {
            "name": "service_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID do serviço",
            "template": "{{service_id}}"
          }
        ],
        "operationId": "service_employees",
        "parameters": [
          {
            "name": "service_id",
            "in": "path",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "service_id",
            "x-template-placeholder": "{{service_id}}"
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
        "x-integration-template": "/v1/employees",
        "x-business-variables": [
          {
            "name": "service_id",
            "location": "query",
            "type": "uuid",
            "required": false,
            "description": "Filtra por serviço"
          }
        ],
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
            },
            "x-business-variable": "service_id",
            "example": "00000000-0000-0000-0000-000000000000"
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
    "/employees/{employee_id}/busy": {
      "get": {
        "tags": [
          "Colaboradores"
        ],
        "summary": "Agenda ocupada",
        "description": "Retorna os agendamentos ativos do profissional identificado por employee_id dentro do intervalo informado. As datas usam YYYY-MM-DD.",
        "x-integration-template": "/v1/employees/{{employee_id}}/busy",
        "x-business-variables": [
          {
            "name": "employee_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID do colaborador",
            "template": "{{employee_id}}"
          },
          {
            "name": "from",
            "location": "query",
            "type": "date",
            "required": true,
            "description": "Data inicial (YYYY-MM-DD)"
          },
          {
            "name": "to",
            "location": "query",
            "type": "date",
            "required": true,
            "description": "Data final (YYYY-MM-DD)"
          }
        ],
        "operationId": "employee_busy",
        "parameters": [
          {
            "name": "employee_id",
            "in": "path",
            "required": true,
            "description": "ID do colaborador",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "employee_id",
            "x-template-placeholder": "{{employee_id}}",
            "example": "00000000-0000-0000-0000-000000000000"
          },
          {
            "name": "from",
            "in": "query",
            "required": true,
            "description": "Data inicial (YYYY-MM-DD)",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "x-business-variable": "from",
            "example": "2026-10-05"
          },
          {
            "name": "to",
            "in": "query",
            "required": true,
            "description": "Data final (YYYY-MM-DD)",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "x-business-variable": "to",
            "example": "2026-10-31"
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
        "x-integration-template": "/v1/availability/dates",
        "x-business-variables": [
          {
            "name": "employee_id",
            "location": "query",
            "type": "uuid",
            "required": true,
            "description": "ID do colaborador"
          },
          {
            "name": "service_id",
            "location": "query",
            "type": "uuid",
            "required": true,
            "description": "ID do serviço"
          },
          {
            "name": "from",
            "location": "query",
            "type": "date",
            "required": true,
            "description": "Data inicial"
          },
          {
            "name": "to",
            "location": "query",
            "type": "date",
            "required": true,
            "description": "Data final"
          }
        ],
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
            },
            "x-business-variable": "employee_id"
          },
          {
            "name": "service_id",
            "in": "query",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "service_id"
          },
          {
            "name": "from",
            "in": "query",
            "required": true,
            "description": "Data inicial",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "x-business-variable": "from"
          },
          {
            "name": "to",
            "in": "query",
            "required": true,
            "description": "Data final",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "x-business-variable": "to"
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
        "x-integration-template": "/v1/availability/slots",
        "x-business-variables": [
          {
            "name": "employee_id",
            "location": "query",
            "type": "uuid",
            "required": true,
            "description": "ID do colaborador"
          },
          {
            "name": "service_id",
            "location": "query",
            "type": "uuid",
            "required": true,
            "description": "ID do serviço"
          },
          {
            "name": "date",
            "location": "query",
            "type": "date",
            "required": true,
            "description": "Data (YYYY-MM-DD)"
          }
        ],
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
            },
            "x-business-variable": "employee_id"
          },
          {
            "name": "service_id",
            "in": "query",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "service_id"
          },
          {
            "name": "date",
            "in": "query",
            "required": true,
            "description": "Data (YYYY-MM-DD)",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "x-business-variable": "date",
            "example": "2026-10-05"
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
        "x-integration-template": "/v1/availability/next",
        "x-business-variables": [
          {
            "name": "employee_id",
            "location": "query",
            "type": "uuid",
            "required": true,
            "description": "ID do colaborador"
          },
          {
            "name": "service_id",
            "location": "query",
            "type": "uuid",
            "required": true,
            "description": "ID do serviço"
          }
        ],
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
            },
            "x-business-variable": "employee_id"
          },
          {
            "name": "service_id",
            "in": "query",
            "required": true,
            "description": "ID do serviço",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "service_id"
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
        "x-integration-template": "/v1/clients",
        "x-business-variables": [
          {
            "name": "phone",
            "location": "query",
            "type": "string",
            "required": true,
            "description": "Telefone/WhatsApp (E.164 ou nacional)"
          }
        ],
        "operationId": "find_client",
        "parameters": [
          {
            "name": "phone",
            "in": "query",
            "required": true,
            "description": "Telefone/WhatsApp (E.164 ou nacional)",
            "schema": {
              "type": "string"
            },
            "x-business-variable": "phone",
            "example": "5511999998888"
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
        "summary": "Criar cliente",
        "description": "Cria um novo cliente. Se o telefone já estiver cadastrado, retorna conflito e não altera o cliente existente.",
        "x-integration-template": "/v1/clients",
        "x-business-variables": [
          {
            "name": "name",
            "location": "body",
            "type": "string",
            "required": true,
            "description": "Nome do cliente"
          },
          {
            "name": "phone",
            "location": "body",
            "type": "string",
            "required": true,
            "description": "Telefone/WhatsApp"
          },
          {
            "name": "email",
            "location": "body",
            "type": "string",
            "required": false,
            "description": "E-mail opcional"
          }
        ],
        "operationId": "create_client",
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
                    "description": "Nome do cliente",
                    "x-business-variable": "name"
                  },
                  "phone": {
                    "type": "string",
                    "description": "Telefone/WhatsApp",
                    "x-business-variable": "phone"
                  },
                  "email": {
                    "type": "string",
                    "description": "E-mail opcional",
                    "x-business-variable": "email"
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
    "/clients/{client_id}": {
      "patch": {
        "tags": [
          "Clientes"
        ],
        "summary": "Atualizar cliente",
        "description": "Atualiza o cliente identificado por client_id. Não cria cliente novo. Envie somente os campos que deseja alterar.",
        "x-integration-template": "/v1/clients/{{client_id}}",
        "x-business-variables": [
          {
            "name": "client_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID do cliente",
            "template": "{{client_id}}"
          },
          {
            "name": "name",
            "location": "body",
            "type": "string",
            "required": false,
            "description": "Novo nome"
          },
          {
            "name": "phone",
            "location": "body",
            "type": "string",
            "required": false,
            "description": "Novo telefone/WhatsApp"
          },
          {
            "name": "email",
            "location": "body",
            "type": "string",
            "required": false,
            "description": "Novo e-mail; envie null para remover"
          }
        ],
        "operationId": "update_client",
        "parameters": [
          {
            "name": "client_id",
            "in": "path",
            "required": true,
            "description": "ID do cliente",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "client_id",
            "x-template-placeholder": "{{client_id}}"
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
                  "name": {
                    "type": "string",
                    "description": "Novo nome",
                    "x-business-variable": "name"
                  },
                  "phone": {
                    "type": "string",
                    "description": "Novo telefone/WhatsApp",
                    "x-business-variable": "phone"
                  },
                  "email": {
                    "type": "string",
                    "description": "Novo e-mail; envie null para remover",
                    "x-business-variable": "email"
                  }
                }
              },
              "example": {
                "name": "Maria Silva",
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
                  "name": "Maria Silva",
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
    "/clients/{client_id}/bookings": {
      "get": {
        "tags": [
          "Clientes"
        ],
        "summary": "Agendamentos do cliente",
        "description": "Lista agendamentos passados e/ou futuros do cliente identificado por client_id. O parâmetro scope aceita upcoming, past ou all.",
        "x-integration-template": "/v1/clients/{{client_id}}/bookings",
        "x-business-variables": [
          {
            "name": "client_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID do cliente",
            "template": "{{client_id}}"
          },
          {
            "name": "scope",
            "location": "query",
            "type": "enum",
            "required": false,
            "description": "upcoming | past | all (default: all)"
          }
        ],
        "operationId": "client_bookings",
        "parameters": [
          {
            "name": "client_id",
            "in": "path",
            "required": true,
            "description": "ID do cliente",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "client_id",
            "x-template-placeholder": "{{client_id}}"
          },
          {
            "name": "scope",
            "in": "query",
            "required": false,
            "description": "upcoming | past | all (default: all)",
            "schema": {
              "type": "string"
            },
            "x-business-variable": "scope",
            "example": "upcoming"
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
    "/booking-holds": {
      "post": {
        "tags": [
          "Reservas temporárias"
        ],
        "summary": "Criar reserva temporária",
        "description": "Reserva temporariamente o horário escolhido antes do pagamento. O hold expira automaticamente se não for concluído.",
        "x-integration-template": "/v1/booking-holds",
        "x-business-variables": [
          {
            "name": "client_id",
            "location": "body",
            "type": "uuid",
            "required": true,
            "description": "ID do cliente"
          },
          {
            "name": "service_id",
            "location": "body",
            "type": "uuid",
            "required": true,
            "description": "ID do serviço"
          },
          {
            "name": "employee_id",
            "location": "body",
            "type": "uuid",
            "required": true,
            "description": "ID do colaborador"
          },
          {
            "name": "booking_date",
            "location": "body",
            "type": "date",
            "required": true,
            "description": "YYYY-MM-DD"
          },
          {
            "name": "booking_time",
            "location": "body",
            "type": "time",
            "required": true,
            "description": "HH:mm"
          }
        ],
        "operationId": "create_booking_hold",
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
                    "description": "ID do cliente",
                    "x-business-variable": "client_id"
                  },
                  "service_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do serviço",
                    "x-business-variable": "service_id"
                  },
                  "employee_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do colaborador",
                    "x-business-variable": "employee_id"
                  },
                  "booking_date": {
                    "type": "string",
                    "format": "date",
                    "description": "YYYY-MM-DD",
                    "x-business-variable": "booking_date"
                  },
                  "booking_time": {
                    "type": "string",
                    "pattern": "^([01]\\\\d|2[0-3]):[0-5]\\\\d$",
                    "description": "HH:mm",
                    "x-business-variable": "booking_time"
                  }
                }
              },
              "example": {
                "client_id": "uuid",
                "service_id": "uuid",
                "employee_id": "uuid",
                "booking_date": "2026-10-05",
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
                  "id": "hold_xxx",
                  "status": "active",
                  "expires_at": "2026-10-05T18:10:00.000Z",
                  "booking_date": "2026-10-05",
                  "booking_time": "15:00"
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
    "/booking-holds/{hold_id}": {
      "get": {
        "tags": [
          "Reservas temporárias"
        ],
        "summary": "Consultar reserva temporária",
        "description": "Consulta o estado da reserva temporária e identifica se ela ainda está ativa ou expirou.",
        "x-integration-template": "/v1/booking-holds/{{hold_id}}",
        "x-business-variables": [
          {
            "name": "hold_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID da reserva temporária",
            "template": "{{hold_id}}"
          }
        ],
        "operationId": "get_booking_hold",
        "parameters": [
          {
            "name": "hold_id",
            "in": "path",
            "required": true,
            "description": "ID da reserva temporária",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "hold_id",
            "x-template-placeholder": "{{hold_id}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "id": "hold_xxx",
                  "status": "active",
                  "expires_at": "2026-10-05T18:10:00.000Z"
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
    "/booking-holds/{hold_id}/cancel": {
      "post": {
        "tags": [
          "Reservas temporárias"
        ],
        "summary": "Cancelar reserva temporária",
        "description": "Libera o horário reservado antes do pagamento ou conclusão do checkout.",
        "x-integration-template": "/v1/booking-holds/{{hold_id}}/cancel",
        "x-business-variables": [
          {
            "name": "hold_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID da reserva temporária",
            "template": "{{hold_id}}"
          }
        ],
        "operationId": "cancel_booking_hold",
        "parameters": [
          {
            "name": "hold_id",
            "in": "path",
            "required": true,
            "description": "ID da reserva temporária",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "hold_id",
            "x-template-placeholder": "{{hold_id}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "status": "cancelled"
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
    "/booking-holds/{hold_id}/complete": {
      "post": {
        "tags": [
          "Reservas temporárias"
        ],
        "summary": "Finalizar reserva temporária",
        "description": "Conclui o checkout e transforma o hold em agendamento somente quando o pagamento informado está confirmado.",
        "x-integration-template": "/v1/booking-holds/{{hold_id}}/complete",
        "x-business-variables": [
          {
            "name": "hold_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID da reserva temporária",
            "template": "{{hold_id}}"
          },
          {
            "name": "payment_id",
            "location": "body",
            "type": "string",
            "required": true,
            "description": "ID do pagamento confirmado"
          }
        ],
        "operationId": "complete_booking_hold",
        "parameters": [
          {
            "name": "hold_id",
            "in": "path",
            "required": true,
            "description": "ID da reserva temporária",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "hold_id",
            "x-template-placeholder": "{{hold_id}}"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "payment_id"
                ],
                "properties": {
                  "payment_id": {
                    "type": "string",
                    "description": "ID do pagamento confirmado",
                    "x-business-variable": "payment_id"
                  }
                }
              },
              "example": {
                "payment_id": "pay_xxx"
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
                  "booking_id": "uuid",
                  "hold_id": "hold_xxx",
                  "payment_id": "pay_xxx",
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
    "/bookings": {
      "post": {
        "tags": [
          "Agendamentos"
        ],
        "summary": "Criar agendamento",
        "description": "Cria um agendamento. Para bots, envie sempre `booking_date` + `booking_time` como fonte única; evite campos genéricos como `data`, `date`, `time` e não envie `start_time` ISO.",
        "x-integration-template": "/v1/bookings",
        "x-business-variables": [
          {
            "name": "client_id",
            "location": "body",
            "type": "uuid",
            "required": true,
            "description": "ID do cliente"
          },
          {
            "name": "service_id",
            "location": "body",
            "type": "uuid",
            "required": true,
            "description": "ID do serviço"
          },
          {
            "name": "employee_id",
            "location": "body",
            "type": "uuid",
            "required": true,
            "description": "ID do colaborador"
          },
          {
            "name": "booking_date",
            "location": "body",
            "type": "date",
            "required": true,
            "description": "YYYY-MM-DD, ex.: 2026-07-15"
          },
          {
            "name": "booking_time",
            "location": "body",
            "type": "time",
            "required": true,
            "description": "HH:mm, ex.: 15:00"
          }
        ],
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
                    "description": "ID do cliente",
                    "x-business-variable": "client_id"
                  },
                  "service_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do serviço",
                    "x-business-variable": "service_id"
                  },
                  "employee_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do colaborador",
                    "x-business-variable": "employee_id"
                  },
                  "booking_date": {
                    "type": "string",
                    "format": "date",
                    "description": "YYYY-MM-DD, ex.: 2026-07-15",
                    "x-business-variable": "booking_date"
                  },
                  "booking_time": {
                    "type": "string",
                    "pattern": "^([01]\\\\d|2[0-3]):[0-5]\\\\d$",
                    "description": "HH:mm, ex.: 15:00",
                    "x-business-variable": "booking_time"
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
    "/bookings/{booking_id}": {
      "get": {
        "tags": [
          "Agendamentos"
        ],
        "summary": "Consultar agendamento",
        "description": "Retorna os detalhes do agendamento identificado por booking_id, dentro da empresa vinculada à API key.",
        "x-integration-template": "/v1/bookings/{{booking_id}}",
        "x-business-variables": [
          {
            "name": "booking_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID do agendamento",
            "template": "{{booking_id}}"
          }
        ],
        "operationId": "get_booking",
        "parameters": [
          {
            "name": "booking_id",
            "in": "path",
            "required": true,
            "description": "ID do agendamento",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "booking_id",
            "x-template-placeholder": "{{booking_id}}"
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
    "/bookings/{booking_id}/cancel": {
      "post": {
        "tags": [
          "Agendamentos"
        ],
        "summary": "Cancelar agendamento",
        "description": "Cancela um agendamento (respeita regras de imutabilidade).",
        "x-integration-template": "/v1/bookings/{{booking_id}}/cancel",
        "x-business-variables": [
          {
            "name": "booking_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID do agendamento",
            "template": "{{booking_id}}"
          },
          {
            "name": "reason",
            "location": "body",
            "type": "string",
            "required": false,
            "description": "Motivo opcional"
          }
        ],
        "operationId": "cancel_booking",
        "parameters": [
          {
            "name": "booking_id",
            "in": "path",
            "required": true,
            "description": "ID do agendamento",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "booking_id",
            "x-template-placeholder": "{{booking_id}}"
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
                    "description": "Motivo opcional",
                    "x-business-variable": "reason"
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
    "/bookings/{booking_id}/reschedule": {
      "post": {
        "tags": [
          "Agendamentos"
        ],
        "summary": "Reagendar",
        "description": "Reagenda usando `client_reschedule_booking` — mesma fonte da UI.",
        "x-integration-template": "/v1/bookings/{{booking_id}}/reschedule",
        "x-business-variables": [
          {
            "name": "booking_id",
            "location": "path",
            "type": "uuid",
            "required": true,
            "description": "ID do agendamento",
            "template": "{{booking_id}}"
          },
          {
            "name": "new_date",
            "location": "body",
            "type": "date",
            "required": true,
            "description": "Nova data"
          },
          {
            "name": "new_time",
            "location": "body",
            "type": "time",
            "required": true,
            "description": "Novo horário"
          }
        ],
        "operationId": "reschedule_booking",
        "parameters": [
          {
            "name": "booking_id",
            "in": "path",
            "required": true,
            "description": "ID do agendamento",
            "schema": {
              "type": "string",
              "format": "uuid"
            },
            "x-business-variable": "booking_id",
            "x-template-placeholder": "{{booking_id}}"
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
                    "description": "Nova data",
                    "x-business-variable": "new_date"
                  },
                  "new_time": {
                    "type": "string",
                    "pattern": "^([01]\\\\d|2[0-3]):[0-5]\\\\d$",
                    "description": "Novo horário",
                    "x-business-variable": "new_time"
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
        "x-integration-template": "/v1/payments/methods",
        "x-business-variables": [],
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
        "description": "Gera uma cobrança para um agendamento existente ou para uma reserva temporária do checkout online. Para checkout com hold, envie hold_id em vez de booking_id.",
        "x-integration-template": "/v1/payments",
        "x-business-variables": [
          {
            "name": "booking_id",
            "location": "body",
            "type": "uuid",
            "required": false,
            "description": "ID do agendamento existente. Não envie junto com hold_id."
          },
          {
            "name": "hold_id",
            "location": "body",
            "type": "uuid",
            "required": false,
            "description": "ID da reserva temporária criada por POST /booking-holds. Não envie junto com booking_id."
          },
          {
            "name": "method",
            "location": "body",
            "type": "enum",
            "required": true,
            "description": "pix | credit_card"
          }
        ],
        "operationId": "create_payment",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "method"
                ],
                "properties": {
                  "booking_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID do agendamento existente. Não envie junto com hold_id.",
                    "x-business-variable": "booking_id"
                  },
                  "hold_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID da reserva temporária criada por POST /booking-holds. Não envie junto com booking_id.",
                    "x-business-variable": "hold_id"
                  },
                  "method": {
                    "type": "string",
                    "description": "pix | credit_card",
                    "x-business-variable": "method"
                  }
                }
              },
              "example": {
                "hold_id": "uuid",
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
                  "id": "pay_xxx",
                  "method": "PIX",
                  "invoice_url": "https://sandbox.asaas.com/i/xxx",
                  "pix_qr_code": "data:image/png;base64,...",
                  "pix_payload": "00020126...",
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
    "/payments/{payment_id}": {
      "get": {
        "tags": [
          "Pagamentos"
        ],
        "summary": "Consultar pagamento",
        "description": "Consulta o pagamento local e atualiza seu status com o gateway quando necessário. payment_id pode ser o ID interno do pagamento ou o ID da cobrança no gateway.",
        "x-integration-template": "/v1/payments/{{payment_id}}",
        "x-business-variables": [
          {
            "name": "payment_id",
            "location": "path",
            "type": "string",
            "required": true,
            "description": "ID do pagamento ou identificador da cobrança no gateway",
            "template": "{{payment_id}}"
          }
        ],
        "operationId": "get_payment",
        "parameters": [
          {
            "name": "payment_id",
            "in": "path",
            "required": true,
            "description": "ID do pagamento ou identificador da cobrança no gateway",
            "schema": {
              "type": "string"
            },
            "x-business-variable": "payment_id",
            "x-template-placeholder": "{{payment_id}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "example": {
                  "id": "pay_xxx",
                  "status": "pending",
                  "gateway_status": "PENDING",
                  "method": "PIX"
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
        "x-integration-template": "/v1/notifications",
        "x-business-variables": [
          {
            "name": "event",
            "location": "body",
            "type": "string",
            "required": true,
            "description": "Ex.: booking.created"
          },
          {
            "name": "booking_id",
            "location": "body",
            "type": "uuid",
            "required": false,
            "description": "Se evento de booking"
          }
        ],
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
                    "description": "Ex.: booking.created",
                    "x-business-variable": "event"
                  },
                  "booking_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Se evento de booking",
                    "x-business-variable": "booking_id"
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
