import { DEFAULT_INVITE_MESSAGE, DEFAULT_INVITE_URL, HELP_IMPROVE_CONSENT, inviteText } from "./help-improve";

describe("inviteText", () => {
  it("uses the built-in message and App Store link", () => {
    expect(inviteText()).toBe(`${DEFAULT_INVITE_MESSAGE}\n\n${DEFAULT_INVITE_URL}`);
  });

  it("uses the live message and link, without repeating the link", () => {
    expect(inviteText("Try DeerAge.", "https://apps.apple.com/x")).toBe("Try DeerAge.\n\nhttps://apps.apple.com/x");
    expect(inviteText("Get it: https://apps.apple.com/x", "https://apps.apple.com/x")).toBe("Get it: https://apps.apple.com/x");
  });

  it("ignores an empty message or a non-https link", () => {
    expect(inviteText("   ", "http://bad")).toBe(`${DEFAULT_INVITE_MESSAGE}\n\n${DEFAULT_INVITE_URL}`);
  });

  it("makes no claim about beating other methods", () => {
    expect(DEFAULT_INVITE_MESSAGE).not.toMatch(/better|beats|more accurate than|best/i);
  });
});

describe("consent text", () => {
  it("says what is shared, why, never sold, and how to stop", () => {
    expect(HELP_IMPROVE_CONSENT).toMatch(/photos/);
    expect(HELP_IMPROVE_CONSENT).toMatch(/Location/);
    expect(HELP_IMPROVE_CONSENT).toMatch(/only to improve DeerAge/);
    expect(HELP_IMPROVE_CONSENT).toMatch(/Never sold/);
    expect(HELP_IMPROVE_CONSENT).toMatch(/Turn it off anytime/);
  });
});
