"use client"

import {
  AiAssistantProvider,
  AnalyticsProvider,
  ColorModeProvider,
  HooksLoader,
  LearningPathProvider,
  MobileProvider,
  ModalProvider,
  NotificationProvider,
  PaginationProvider,
  ScrollControllerProvider,
  SiteConfigProvider,
} from "docs-ui"
import { DocsConfig } from "types"
import SidebarProvider from "./sidebar"
import SearchProvider from "./search"
import { MainNavProvider } from "./main-nav"

type ProvidersProps = {
  children?: React.ReactNode
  config: DocsConfig
}

const Providers = ({ children, config }: ProvidersProps) => {
  return (
    <AnalyticsProvider reoDevKey={process.env.NEXT_PUBLIC_REO_DEV_CLIENT_ID}>
      <SiteConfigProvider config={config}>
        <MobileProvider>
          <ColorModeProvider>
            <ModalProvider>
              <LearningPathProvider>
                <NotificationProvider>
                  <ScrollControllerProvider scrollableSelector="#main">
                    <SidebarProvider config={config}>
                      <PaginationProvider>
                        <MainNavProvider>
                          <SearchProvider>
                            <AiAssistantProvider
                              integrationId={
                                process.env.NEXT_PUBLIC_INTEGRATION_ID || "temp"
                              }
                            >
                              <HooksLoader
                                options={{
                                  pageScrollManager: true,
                                  currentLearningPath: false,
                                }}
                              >
                                {children}
                              </HooksLoader>
                            </AiAssistantProvider>
                          </SearchProvider>
                        </MainNavProvider>
                      </PaginationProvider>
                    </SidebarProvider>
                  </ScrollControllerProvider>
                </NotificationProvider>
              </LearningPathProvider>
            </ModalProvider>
          </ColorModeProvider>
        </MobileProvider>
      </SiteConfigProvider>
    </AnalyticsProvider>
  )
}

export default Providers
