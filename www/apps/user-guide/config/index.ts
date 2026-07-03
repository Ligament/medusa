import { DocsConfig, Sidebar } from "types"
import { generatedSidebars } from "@/generated/sidebar.mjs"
import { globalConfig } from "docs-ui"
import { basePathUrl } from "../utils/base-path-url"

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/user-guide"

export const config: DocsConfig = {
  ...globalConfig,
  titleSuffix: "Medusa Admin User Guide",
  description:
    "Explore and learn how to use the Medusa Admin. Learn how to manage products, orders, customers, and more within the Medusa Admin dashboard.",
  baseUrl,
  basePath,
  sidebars: generatedSidebars as Sidebar.Sidebar[],
  project: {
    title: "User Guide",
    key: "user-guide",
  },
  logo: `${basePath}/images/logo.png`,
  breadcrumbOptions: {
    startItems: [
      {
        title: "Documentation",
        link: baseUrl,
      },
    ],
  },
  version: {
    ...globalConfig.version,
    bannerImage: {
      light: basePathUrl("/images/release.png"),
      dark: basePathUrl("/images/release-dark.png"),
    },
  },
}
