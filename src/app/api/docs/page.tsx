"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

/** Interactive API docs (TKT-046): renders the served OpenAPI spec. */
export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SwaggerUI
        url="/api/docs/openapi.yaml"
        docExpansion="list"
        persistAuthorization
        tryItOutEnabled
      />
    </div>
  );
}
