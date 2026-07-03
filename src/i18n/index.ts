import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ar from "./ar.json";

const saved = localStorage.getItem("minc-lang") || "ar";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: saved,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lang) => {
  applyDirection(lang);
});

export function applyDirection(lang: string) {
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
}

applyDirection(saved);

export function switchLanguage() {
  const next = i18n.language === "ar" ? "en" : "ar";
  i18n.changeLanguage(next);
  localStorage.setItem("minc-lang", next);
  applyDirection(next);
}

export default i18n;
