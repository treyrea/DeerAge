/**
 * "Help improve DeerAge" and "Invite a hunting buddy": the words, in one place.
 * The invite text and link can be changed live (remote config copy.inviteMessage / copy.inviteUrl).
 */

export const HELP_IMPROVE_TITLE = "Help improve DeerAge";

export const HELP_IMPROVE_SUBTITLE = "Share your scan photos to make aging more accurate.";

export const HELP_IMPROVE_CONSENT =
  "When this is on, DeerAge saves the photos you scan and DeerAge's answer, plus any real age you add later, " +
  "so we can test and improve aging accuracy.\n\n" +
  "Location and other photo details are removed before saving. Your name and account are not attached.\n\n" +
  "Used only to improve DeerAge. Never sold. Turn it off anytime in Settings; photos you scan after that are not shared.";

export const DEFAULT_INVITE_URL = "https://apps.apple.com/us/app/deerage/id6755117006";

export const DEFAULT_INVITE_MESSAGE =
  "I'm using DeerAge to age deer from a photo. It aged about 80% of known-age test deer correctly. " +
  "Download it and turn on \"Help improve DeerAge\" in Settings to share your photos and help make it even more accurate.";

/** The share text: the live message (or the default), then the link once. */
export function inviteText(message?: string, url?: string): string {
  const body = message?.trim() || DEFAULT_INVITE_MESSAGE;
  const link = url?.trim().startsWith("https://") ? url.trim() : DEFAULT_INVITE_URL;
  return body.includes(link) ? body : `${body}\n\n${link}`;
}

export const REAL_AGES = ["1.5", "2.5", "3.5", "4.5", "5.5", "6.5", "7.5+"] as const;

export const REAL_AGE_SOURCES = [
  { id: "jawbone", label: "Jawbone" },
  { id: "known", label: "Known deer" },
] as const;
