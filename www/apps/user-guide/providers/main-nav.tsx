"use client"

import {
  getNavDropdownItems,
  MainNavProvider as UiMainNavProvider,
} from "docs-ui"
import { Book, House, TimelineVertical } from "@medusajs/icons"
import { useMemo } from "react"
import { MenuItem } from "types"
import { config } from "../config"
import { LanguageSwitcher } from "../components/LanguageSwitcher"

type MainNavProviderProps = {
  children?: React.ReactNode
}

export const MainNavProvider = ({ children }: MainNavProviderProps) => {
  const navigationDropdownItems = useMemo(
    () =>
      getNavDropdownItems({
        basePath: config.baseUrl,
      }),
    []
  )

  // Passing `additionalMenuItems` replaces docs-ui's default entries, so those
  // are repeated here alongside the language section.
  const additionalMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        type: "link",
        icon: <House />,
        title: "Homepage",
        link: "https://medusajs.com",
      },
      {
        type: "link",
        icon: <Book />,
        title: "Medusa v1",
        link: "https://docs.medusajs.com/v1",
      },
      {
        type: "link",
        icon: <TimelineVertical />,
        title: "Changelog",
        link: "https://medusajs.com/changelog",
      },
      {
        type: "divider",
      },
      {
        type: "custom",
        content: <LanguageSwitcher />,
      },
    ],
    []
  )

  return (
    <UiMainNavProvider
      navItems={navigationDropdownItems}
      additionalMenuItems={additionalMenuItems}
    >
      {children}
    </UiMainNavProvider>
  )
}
