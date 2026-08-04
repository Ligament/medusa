export type LocaleCode = "en" | "th"

export const LOCALES: { code: LocaleCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "th", label: "ไทย" },
]

export const DEFAULT_LOCALE: LocaleCode = "en"

const LOCALE_CODES = LOCALES.map((locale) => locale.code)

/**
 * Reads the locale from a pathname such as `/th/orders`. Paths without a
 * locale segment are served by the middleware's default locale.
 */
export const getLocaleFromPathname = (pathname: string): LocaleCode => {
  const [, firstSegment] = pathname.split("/")

  return LOCALE_CODES.includes(firstSegment as LocaleCode)
    ? (firstSegment as LocaleCode)
    : DEFAULT_LOCALE
}

/**
 * Removes the locale segment from a pathname, always returning a leading slash.
 */
export const stripLocaleFromPathname = (pathname: string): string => {
  const segments = pathname.split("/")

  if (LOCALE_CODES.includes(segments[1] as LocaleCode)) {
    segments.splice(1, 1)
  }

  const stripped = segments.join("/")

  return stripped.startsWith("/") ? stripped : `/${stripped}`
}

/**
 * Rewrites a pathname to the same page in another locale, so switching the
 * language keeps the reader on the page they're currently on.
 */
export const localizePathname = (
  pathname: string,
  locale: LocaleCode
): string => {
  const stripped = stripLocaleFromPathname(pathname)

  return stripped === "/" ? `/${locale}` : `/${locale}${stripped}`
}
