import React from "react";
import { Navigate, useParams } from "react-router-dom";
import { getAgentConfigBySlug } from "./config";
import GenericAgentFormPage from "./generic";
import SelfServiceMktPage from "./mkt";
import SelfServiceJ360Page from "./j360";
import SelfServiceFinNexusPage from "./fin-nexus";
import SelfServicePitchPage from "./pitch";

const pageOverrides: Record<string, React.ReactNode> = {
  mkt: <SelfServiceMktPage />,
  j360: <SelfServiceJ360Page />,
  "fin-nexus": <SelfServiceFinNexusPage />,
  pitch: <SelfServicePitchPage />,
};

export default function SelfServiceRouter() {
  const { slug } = useParams<{ slug: string }>();
  const config = getAgentConfigBySlug(slug);

  if (!config) {
    return <Navigate to="/self-service" replace />;
  }

  const override = pageOverrides[config.slug];
  if (override) {
    return <>{override}</>;
  }

  if (config.kind === "custom") {
    return <Navigate to="/self-service" replace />;
  }

  return <GenericAgentFormPage config={config} />;
}
