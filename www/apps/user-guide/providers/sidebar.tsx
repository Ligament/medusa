"use client"

import {
  SidebarProvider as UiSidebarProvider,
  useScrollController,
} from "docs-ui"
import { DocsConfig } from "types"

type SidebarProviderProps = {
  children?: React.ReactNode
  config: DocsConfig
}

const SidebarProvider = ({ children, config }: SidebarProviderProps) => {
  const { scrollableElement } = useScrollController()

  return (
    <UiSidebarProvider
      scrollableElement={scrollableElement}
      sidebars={config.sidebars}
    >
      {children}
    </UiSidebarProvider>
  )
}

export default SidebarProvider
