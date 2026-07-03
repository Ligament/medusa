import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const locales = ["en", "th"]
const defaultLocale = "en"

export function middleware(request: NextRequest) {
  const { pathname, basePath } = request.nextUrl

  // Check if pathname starts with a locale segment (e.g. /en or /th)
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  if (pathnameHasLocale) {
    const locale = pathname.startsWith("/th") ? "th" : "en"
    const cleanPath = pathname === `/${locale}` ? "/" : pathname.slice(3)

    // Set header for layout to read the active locale
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-locale", locale)

    const newUrl = new URL(request.url)

    if (locale === "th") {
      // Serve the Thai page under app/th
      newUrl.pathname = `${basePath}/th${cleanPath === "/" ? "" : cleanPath}`
      return NextResponse.rewrite(newUrl, {
        request: {
          headers: requestHeaders,
        },
      })
    } else {
      // Serve the English page from root app/
      newUrl.pathname = `${basePath}${cleanPath}`
      return NextResponse.rewrite(newUrl, {
        request: {
          headers: requestHeaders,
        },
      })
    }
  }

  // Redirect if there is no locale prefix
  const newUrl = new URL(request.url)
  newUrl.pathname = `${basePath}/${defaultLocale}${pathname}`
  return NextResponse.redirect(newUrl)
}

export const config = {
  matcher: [
    // Skip all internal paths (_next, static files, etc.)
    "/((?!api|_next/static|_next/image|images|favicon.ico|icon.ico|globals.css|wrangler.jsonc|manifest.json|llms.txt|raw-mdx).*)",
  ],
}
