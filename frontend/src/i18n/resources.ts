export const supportedLanguages = ["en", "ru", "tr"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const localeByLanguage: Record<SupportedLanguage, string> = {
  en: "en-GB",
  ru: "ru-RU",
  tr: "tr-TR",
};

export function getSupportedLanguage(value?: string | null): SupportedLanguage {
  const normalized = value?.toLowerCase().split("-")[0];

  if (normalized === "ru" || normalized === "tr") {
    return normalized;
  }

  return "en";
}
