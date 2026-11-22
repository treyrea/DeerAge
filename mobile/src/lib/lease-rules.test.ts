import { migrateLeaseRules, showPreShotRecord } from "./lease-rules";

describe("lease rules", () => {
  it("keeps the pre-shot record hidden when the setting is off", () => {
    expect(showPreShotRecord(false, true)).toBe(false);
    expect(showPreShotRecord(true, false)).toBe(false);
    expect(showPreShotRecord(true, true)).toBe(true);
  });

  it("turns lease rules on for someone who already set a manager or saved a record", () => {
    expect(migrateLeaseRules({
      chosen: false,
      enabled: false,
      managerName: "Sam",
      managerPhone: "",
      savedRecords: 0,
    })).toEqual({ chosen: true, enabled: true });

    expect(migrateLeaseRules({
      chosen: false,
      enabled: false,
      managerName: "",
      managerPhone: "555",
      savedRecords: 0,
    }).enabled).toBe(true);

    expect(migrateLeaseRules({
      chosen: false,
      enabled: false,
      managerName: "",
      managerPhone: "",
      savedRecords: 2,
    }).enabled).toBe(true);

    expect(migrateLeaseRules({
      chosen: false,
      enabled: false,
      managerName: "  ",
      managerPhone: "",
      savedRecords: 0,
    })).toEqual({ chosen: true, enabled: false });
  });

  it("leaves a choice the hunter already made", () => {
    expect(migrateLeaseRules({
      chosen: true,
      enabled: false,
      managerName: "Sam",
      managerPhone: "555",
      savedRecords: 4,
    })).toEqual({ chosen: true, enabled: false });
  });
});
