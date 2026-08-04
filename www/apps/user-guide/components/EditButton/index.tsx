"use client"

import { EditButton as UiEditButton } from "docs-ui"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DEFAULT_LOCALE,
  getLocaleFromPathname,
  stripLocaleFromPathname,
} from "../../utils/locale"

const EditButton = () => {
  const pathname = usePathname()
  const [editDate, setEditDate] = useState<string | undefined>()

  // The default locale is served from `app/`, while other locales live in
  // `app/<locale>/`, so the URL's locale segment can't be used verbatim.
  const relativeFilePath = useMemo(() => {
    const locale = getLocaleFromPathname(pathname)
    const pathWithoutLocale = stripLocaleFromPathname(pathname).replace(
      /\/$/,
      ""
    )
    const localeDir = locale === DEFAULT_LOCALE ? "" : `/${locale}`

    return `app${localeDir}${pathWithoutLocale}/page.mdx`
  }, [pathname])

  const loadEditDate = useCallback(async () => {
    const generatedEditDates = (await import("../../generated/edit-dates.mjs"))
      .generatedEditDates
    setEditDate(
      (generatedEditDates as Record<string, string>)[relativeFilePath]
    )
  }, [relativeFilePath])

  useEffect(() => {
    void loadEditDate()
  }, [loadEditDate])

  if (!editDate) {
    return <></>
  }

  return (
    <UiEditButton
      filePath={`/www/apps/user-guide/${relativeFilePath}`}
      editDate={editDate}
    />
  )
}

export default EditButton
