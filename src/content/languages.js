// English display names and same-language checks for caption language codes
// (from YouTube, navigator.language, or the popup's subtitle setting).

// Nonstandard or variant codes mapped to the base language they mean. "jp" is
// what the popup has sent for Japanese; Norwegian variants count as one.
const ALIASES = { jp: "ja", nb: "no", nn: "no" };

const displayNames = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "none",
});

// "en-US" → "en", "iw" → "he" (Intl canonicalises legacy codes); null if invalid.
export function baseLanguage(code) {
  try {
    const { language } = new Intl.Locale(code);
    return ALIASES[language] ?? language;
  } catch {
    return null;
  }
}

// "pt-BR" → "Portuguese"; "System" when the code isn't a known language.
export function languageName(code) {
  const base = baseLanguage(code);
  return (base && displayNames.of(base)) || "System";
}

export function isSameLanguage(a, b) {
  const base = baseLanguage(a);
  return base !== null && base === baseLanguage(b);
}
