"use client"

import { EllipseMiniSolid } from "@medusajs/icons"
import clsx from "clsx"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import {
  LOCALES,
  getLocaleFromPathname,
  localizePathname,
} from "../../utils/locale"

type LanguageSwitcherProps = {
  className?: string
}

/**
 * Language options rendered as a section of the main nav's dropdown menu.
 * Mirrors the markup of docs-ui's theme menu so both sections look alike.
 */
export const LanguageSwitcher = ({ className }: LanguageSwitcherProps) => {
  const pathname = usePathname()
  const activeLocale = useMemo(
    () => getLocaleFromPathname(pathname),
    [pathname]
  )

  return (
    <div className={className} data-testid="language-switcher">
      <div
        className={clsx(
          "flex items-center gap-docs_0.5",
          "py-docs_0.25 px-docs_0.5",
          "rounded-docs_xs text-compact-x-small-plus",
          "text-medusa-fg-subtle"
        )}
      >
        Language
      </div>
      {LOCALES.map((locale) => {
        const isActive = locale.code === activeLocale

        return (
          <div className="px-docs_0.25" key={locale.code}>
            <Link
              href={localizePathname(pathname, locale.code)}
              hrefLang={locale.code}
              lang={locale.code}
              aria-current={isActive ? "true" : undefined}
              className={clsx(
                "flex items-center gap-docs_0.5",
                "py-docs_0.25 px-docs_0.5 cursor-pointer",
                "rounded-docs_xs text-medusa-fg-base",
                "hover:bg-medusa-bg-component-hover"
              )}
              data-testid={`${locale.code}-locale-option`}
            >
              <EllipseMiniSolid className={clsx(!isActive && "invisible")} />
              <span
                className={clsx(
                  !isActive && "text-compact-small",
                  isActive && "text-compact-small-plus"
                )}
              >
                {locale.label}
              </span>
            </Link>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Inline variant for placements outside the dropdown menu, such as the footer.
 * The dropdown menu is desktop-only, so this keeps the switcher reachable on mobile.
 */
export const LanguageSwitcherInline = ({
  className,
}: LanguageSwitcherProps) => {
  const pathname = usePathname()
  const activeLocale = useMemo(
    () => getLocaleFromPathname(pathname),
    [pathname]
  )

  return (
    <div
      className={clsx("flex items-center gap-docs_0.25", className)}
      data-testid="language-switcher-inline"
    >
      {LOCALES.map((locale) => {
        const isActive = locale.code === activeLocale

        return (
          <Link
            key={locale.code}
            href={localizePathname(pathname, locale.code)}
            hrefLang={locale.code}
            lang={locale.code}
            aria-current={isActive ? "true" : undefined}
            className={clsx(
              "py-docs_0.25 px-docs_0.5 rounded-docs_xs",
              "text-compact-small",
              isActive && "text-medusa-fg-base bg-medusa-bg-component",
              !isActive && [
                "text-medusa-fg-subtle",
                "hover:bg-medusa-bg-component-hover hover:text-medusa-fg-base",
              ]
            )}
            data-testid={`${locale.code}-locale-link`}
          >
            {locale.label}
          </Link>
        )
      })}
    </div>
  )
}
