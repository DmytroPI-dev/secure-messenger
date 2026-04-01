import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  getSupportedLanguage,
  type SupportedLanguage,
} from "./resources";

const languageStorageKey = "forecast-lang";
const loadedLanguages = new Set<SupportedLanguage>();

function getInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(languageStorageKey);
  if (stored) {
    return getSupportedLanguage(stored);
  }

  return getSupportedLanguage(window.navigator.language);
}

async function fetchTranslations(language: SupportedLanguage) {
  const response = await fetch(`/api/i18n/${language}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load translations for ${language}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function registerTranslations(
  language: SupportedLanguage,
  bundle: Record<string, unknown>,
) {
  i18n.addResourceBundle(language, "translation", bundle, true, true);
  loadedLanguages.add(language);
}

async function ensureTranslationsLoaded(language: SupportedLanguage) {
  if (loadedLanguages.has(language)) {
    return;
  }

  const bundle = await fetchTranslations(language);
  registerTranslations(language, bundle);
}

function syncDocumentLanguage(language?: string | null) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = getSupportedLanguage(language);
}

export async function initI18n() {
  let initialLanguage = getInitialLanguage();
  const englishBundle = await fetchTranslations("en");
  const resources: Record<string, { translation: Record<string, unknown> }> = {
    en: { translation: englishBundle },
  };

  loadedLanguages.add("en");

  if (initialLanguage !== "en") {
    try {
      const initialBundle = await fetchTranslations(initialLanguage);
      resources[initialLanguage] = { translation: initialBundle };
      loadedLanguages.add(initialLanguage);
    } catch {
      initialLanguage = "en";
    }
  }

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources,
      lng: initialLanguage,
      fallbackLng: "en",
      interpolation: {
        escapeValue: false,
      },
    });

    if (typeof window !== "undefined") {
      i18n.on("languageChanged", (language) => {
        const normalized = getSupportedLanguage(language);
        window.localStorage.setItem(languageStorageKey, normalized);
        syncDocumentLanguage(normalized);
      });
    }
  } else {
    for (const [language, data] of Object.entries(resources)) {
      registerTranslations(language as SupportedLanguage, data.translation);
    }

    await i18n.changeLanguage(initialLanguage);
  }

  syncDocumentLanguage(i18n.resolvedLanguage);
}

export async function changeAppLanguage(language: string) {
  const normalized = getSupportedLanguage(language);

  try {
    await ensureTranslationsLoaded(normalized);
    await i18n.changeLanguage(normalized);
  } catch {
    await ensureTranslationsLoaded("en");
    await i18n.changeLanguage("en");
  }
}

export default i18n;