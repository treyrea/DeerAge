import { resolveApiBaseUrl } from "./endpoint";

describe("resolveApiBaseUrl", () => {
  it("uses the EAS environment value first", () => {
    expect(resolveApiBaseUrl("https://env.example.com/", "https://config.example.com", "")).toBe("https://env.example.com");
  });

  it("falls back to app.json when an update was published without the EAS environment", () => {
    expect(resolveApiBaseUrl(undefined, "https://deerage-api.vercel.app", "")).toBe("https://deerage-api.vercel.app");
    expect(resolveApiBaseUrl("", "https://deerage-api.vercel.app/", "")).toBe("https://deerage-api.vercel.app");
    expect(resolveApiBaseUrl("   ", "https://deerage-api.vercel.app", "")).toBe("https://deerage-api.vercel.app");
  });

  it("falls back to the CI endpoint last", () => {
    expect(resolveApiBaseUrl("", undefined, "https://ci.example.com")).toBe("https://ci.example.com");
  });

  it("ignores values that are not https URLs", () => {
    expect(resolveApiBaseUrl("deerage-api.vercel.app", 42, null)).toBe("");
    expect(resolveApiBaseUrl("http://insecure.example.com", "", "")).toBe("");
  });

  it("is empty only when nothing is set", () => {
    expect(resolveApiBaseUrl(undefined, undefined, "")).toBe("");
  });
});
