import { APP_STORE_URL, PLAY_STORE_URL, liveStoreVersion, resetStoreVersionCache, storeListingUrl, storeName } from "./store-version";

describe("live store version", () => {
  beforeEach(() => resetStoreVersionCache());

  it("reads the iTunes lookup version and then uses the cache", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({ results: [{ version: "1.0.9" }] }),
      } as Response;
    }) as typeof fetch;
    await expect(liveStoreVersion({ fetchImpl, now: 1_000 })).resolves.toBe("1.0.9");
    await expect(liveStoreVersion({ fetchImpl, now: 2_000 })).resolves.toBe("1.0.9");
    expect(calls).toBe(1);
  });

  it("keeps the last version when the lookup fails", async () => {
    const ok = (async () => ({ ok: true, json: async () => ({ results: [{ version: "1.2.0" }] }) }) as Response) as typeof fetch;
    await liveStoreVersion({ fetchImpl: ok, now: 1_000 });
    const fail = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    await expect(liveStoreVersion({ fetchImpl: fail, now: 10_000_000_000 })).resolves.toBe("1.2.0");
  });
});

describe("store listing helpers", () => {
  it("points Android to Google Play and iOS to the App Store", () => {
    expect(storeListingUrl("android")).toBe(PLAY_STORE_URL);
    expect(storeListingUrl("ios")).toBe(APP_STORE_URL);
    expect(PLAY_STORE_URL).toBe("https://play.google.com/store/apps/details?id=com.secondgen.buckage");
    expect(storeName("android")).toBe("Google Play");
    expect(storeName("ios")).toBe("the App Store");
  });
});
