import type { Metadata } from "next"
import Providers from "@/providers"
import "./globals.css"
import { BareboneLayout, TightLayout } from "docs-ui"
import { config as originalConfig } from "@/config"
import { getLocalizedConfig } from "@/utils/translate"
import clsx from "clsx"
import Footer from "../components/Footer"
import { inter, robotoMono } from "./fonts"
import { headers } from "next/headers"

const ogImage =
  "https://res.cloudinary.com/dza7lstvk/image/upload/v1732200992/Medusa%20Resources/opengraph-image_daq6nx.jpg"

export const metadata: Metadata = {
  title: {
    template: `%s - ${originalConfig.titleSuffix}`,
    default: originalConfig.titleSuffix || "",
  },
  description: originalConfig.description,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  ),
  openGraph: {
    images: [
      {
        url: ogImage,
        type: "image/jpeg",
        height: "1260",
        width: "2400",
      },
    ],
  },
  twitter: {
    images: [
      {
        url: ogImage,
        type: "image/jpeg",
        height: "1260",
        width: "2400",
      },
    ],
  },
  alternates: {
    types: {
      "text/plain": "/llms.txt",
    },
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headerList = await headers()
  const locale = headerList.get("x-locale") || "en"
  const localizedConfig = getLocalizedConfig(originalConfig, locale)

  return (
    <BareboneLayout
      htmlClassName={clsx(inter.variable, robotoMono.variable)}
      gaId={process.env.NEXT_PUBLIC_GA_ID}
    >
      <TightLayout
        ProvidersComponent={(props) => (
          <Providers {...props} config={localizedConfig} />
        )}
        footerComponent={<Footer />}
      >
        {children}
      </TightLayout>
    </BareboneLayout>
  )
}
