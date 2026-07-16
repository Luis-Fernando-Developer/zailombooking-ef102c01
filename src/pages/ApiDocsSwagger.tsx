// =============================================================================
// SWAGGER UI VIEW — /api-docs/swagger
// Embarca o Swagger UI oficial apontando para o spec OpenAPI gerado em runtime
// a partir do catálogo de endpoints (fonte única: ApiDocs ENDPOINTS array).
// =============================================================================

import { useMemo } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { buildOpenApiSpec, type OpenApiSourceEndpoint } from "@/lib/openapi-spec";

interface Props {
  endpoints: OpenApiSourceEndpoint[];
}

export default function SwaggerView({ endpoints }: Props) {
  const spec = useMemo(() => buildOpenApiSpec(endpoints), [endpoints]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white">
      <SwaggerUI spec={spec} docExpansion="list" defaultModelsExpandDepth={1} />
    </div>
  );
}
