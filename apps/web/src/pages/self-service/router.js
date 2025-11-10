import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate, useParams } from "react-router-dom";
import { getAgentConfigBySlug } from "./config";
import GenericAgentFormPage from "./generic";
import SelfServiceMktPage from "./mkt";
import SelfServiceJ360Page from "./j360";
import SelfServiceFinNexusPage from "./fin-nexus";
import SelfServicePitchPage from "./pitch";
const pageOverrides = {
    mkt: _jsx(SelfServiceMktPage, {}),
    j360: _jsx(SelfServiceJ360Page, {}),
    "fin-nexus": _jsx(SelfServiceFinNexusPage, {}),
    pitch: _jsx(SelfServicePitchPage, {}),
};
export default function SelfServiceRouter() {
    const { slug } = useParams();
    const config = getAgentConfigBySlug(slug);
    if (!config) {
        return _jsx(Navigate, { to: "/self-service", replace: true });
    }
    const override = pageOverrides[config.slug];
    if (override) {
        return _jsx(_Fragment, { children: override });
    }
    if (config.kind === "custom") {
        return _jsx(Navigate, { to: "/self-service", replace: true });
    }
    return _jsx(GenericAgentFormPage, { config: config });
}
