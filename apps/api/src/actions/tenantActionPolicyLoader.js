import fs from "node:fs";
export function loadTenantActionPolicy() {
    const fileUrl = new URL("./tenantActionPolicy.json", import.meta.url);
    const data = fs.readFileSync(fileUrl, "utf8");
    const json = JSON.parse(data);
    const map = new Map();
    for (const tenantId of Object.keys(json)) {
        const entry = json[tenantId];
        map.set(tenantId, {
            tenantId,
            version: entry.version,
            overrides: entry.overrides ?? {},
        });
    }
    return map;
}
//# sourceMappingURL=tenantActionPolicyLoader.js.map