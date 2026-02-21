import { describe, expect, it } from "vitest";
import { isOriginAllowed, parseOriginFromReferer, shouldCheckOrigin } from "../services/profileGuards";

describe("profile guards", () => {
  it("parses origin from referer", () => {
    expect(parseOriginFromReferer("https://example.com/a/b")).toBe("https://example.com");
    expect(parseOriginFromReferer("invalid")).toBeNull();
    expect(parseOriginFromReferer(null)).toBeNull();
  });

  it("checks mutating methods", () => {
    expect(shouldCheckOrigin("POST")).toBe(true);
    expect(shouldCheckOrigin("PUT")).toBe(true);
    expect(shouldCheckOrigin("PATCH")).toBe(true);
    expect(shouldCheckOrigin("DELETE")).toBe(true);
    expect(shouldCheckOrigin("GET")).toBe(false);
  });

  it("validates allowed origins", () => {
    const allowed = ["https://app.example.com"];
    expect(isOriginAllowed({ allowedOrigins: allowed, origin: "https://app.example.com" }).ok).toBe(true);
    expect(isOriginAllowed({ allowedOrigins: allowed, origin: "https://evil.com" }).ok).toBe(false);
    expect(
      isOriginAllowed({
        allowedOrigins: allowed,
        origin: null,
        referer: "https://app.example.com/path",
      }).ok
    ).toBe(true);
  });
});
