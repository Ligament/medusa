import { DocsConfig, Sidebar } from "types"

const THAI_TRANSLATIONS: Record<string, string> = {
  "User Guide": "คู่มือการใช้งาน",
  "Introduction": "บทนำ",
  "Reset Password": "รีเซ็ตรหัสผ่าน",
  "Tips": "เคล็ดลับ",
  "Orders": "คำสั่งซื้อ",
  "Overview": "ภาพรวม",
  "Manage Details": "จัดการรายละเอียด",
  "Manage Payments": "จัดการการชำระเงิน",
  "Manage Fulfillments": "จัดการการจัดส่ง",
  "Edit Order Items": "แก้ไขรายการคำสั่งซื้อ",
  "Manage Returns": "จัดการการคืนสินค้า",
  "Manage Exchanges": "จัดการการเปลี่ยนสินค้า",
  "Manage Claims": "จัดการการเคลมสินค้า",
  "Draft Orders": "ร่างคำสั่งซื้อ",
  "Create Draft Order": "สร้างร่างคำสั่งซื้อ",
  "Manage Draft Order": "จัดการร่างคำสั่งซื้อ",
  "Export Orders": "ส่งออกคำสั่งซื้อ",
  "Products": "สินค้า",
  "Create Product": "สร้างสินค้า",
  "Multi-Part Product": "สินค้าหลายชิ้นส่วน",
  "Bundle Product": "สินค้าจัดชุด",
  "Edit Product": "แก้ไขสินค้า",
  "Manage Variants": "จัดการตัวเลือกสินค้า",
  "Manage Collections": "จัดการคอลเลกชัน",
  "Manage Categories": "จัดการหมวดหมู่",
  "Manage Product Options": "จัดการตัวเลือกสินค้า",
  "Import Products": "นำเข้าสินค้า",
  "Export Products": "ส่งออกสินค้า",
  "Inventory": "คลังสินค้า",
  "Manage Inventory": "จัดการคลังสินค้า",
  "Manage Reservations": "จัดการการจองสินค้า",
  "Customers": "ลูกค้า",
  "Manage Customers": "จัดการลูกค้า",
  "Manage Groups": "จัดการกลุ่มลูกค้า",
  "Promotions": "โปรโมชัน",
  "Create Promotion": "สร้างโปรโมชัน",
  "Manage Promotion": "จัดการโปรโมชัน",
  "Manage Campaigns": "จัดการแคมเปญ",
  "Price Lists": "รายการราคา",
  "Create Price List": "สร้างรายการราคา",
  "Manage Price List": "จัดการรายการราคา",
  "Loyalty": "โปรแกรมสะสมคะแนน",
  "Gift Cards": "บัตรของขวัญ",
  "Manage Gift Cards": "จัดการบัตรของขวัญ",
  "Gift Card Products": "สินค้าบัตรของขวัญ",
  "Manage Gift Card Products": "จัดการสินค้าบัตรของขวัญ",
  "Store Credits": "เครดิตร้านค้า",
  "Manage Store Credits": "จัดการเครดิตร้านค้า",
  "Settings": "การตั้งค่า",
  "Store": "ร้านค้า",
  "Users": "ผู้ใช้งาน",
  "Manage Invites": "จัดการคำเชิญ",
  "Regions": "ภูมิภาค",
  "Tax Regions": "ภูมิภาคภาษี",
  "Return Reasons": "เหตุผลการคืนสินค้า",
  "Refund Reasons": "เหตุผลการคืนเงิน",
  "Sales Channels": "ช่องทางการขาย",
  "Product Types": "ประเภทสินค้า",
  "Product Tags": "แท็กสินค้า",
  "Location & Shipping": "สถานที่และการจัดส่ง",
  "Manage Locations": "จัดการสถานที่",
  "Shipping Profiles": "โปรไฟล์การจัดส่ง",
  "Shipping Option Types": "ประเภทตัวเลือกการจัดส่ง",
  "Translations": "การแปลภาษา",
  "Developer Settings": "การตั้งค่าสำหรับนักพัฒนา",
  "Publishable API Keys": "คีย์ API สาธารณะ",
  "Secret API Keys": "คีย์ API ลับ",
  "Workflows": "เวิร์กโฟลว์",
  "Profile": "โปรไฟล์",
  "Documentation": "เอกสารประกอบ",
}

function translateText(text: string): string {
  return THAI_TRANSLATIONS[text] || text
}

function prefixPath(path: string, locale: string): string {
  if (path.startsWith("/en/") || path === "/en") {
    const cleanPath = path === "/en" ? "/" : path.slice(3)
    return locale === "en" ? path : (cleanPath === "/" ? `/${locale}` : `/${locale}${cleanPath}`)
  }
  if (locale === "en") return path
  if (path === "/") return `/${locale}`
  if (path.startsWith(`/${locale}/`) || path === `/${locale}`) return path
  return `/${locale}${path}`
}

function translateSidebarItem(item: Sidebar.SidebarItem, locale: string): Sidebar.SidebarItem {
  const newItem = { ...item }

  if ("title" in newItem && newItem.title) {
    newItem.title = translateText(newItem.title)
  }

  if ("path" in newItem && newItem.path) {
    newItem.path = prefixPath(newItem.path, locale)
  }

  if ("children" in newItem && newItem.children) {
    newItem.children = newItem.children.map((child) => translateSidebarItem(child, locale))
  }

  return newItem
}

export function getLocalizedConfig(config: DocsConfig, locale: string): DocsConfig {
  if (locale === "en") return config

  const localizedConfig = { ...config }

  // 1. Translate metadata and titles
  localizedConfig.titleSuffix = "คู่มือการใช้งาน Medusa Admin"
  localizedConfig.description =
    "เรียนรู้และสำรวจวิธีการใช้งาน Medusa Admin วิธีการจัดการสินค้า คำสั่งซื้อ ลูกค้า และข้อมูลต่างๆ ในระบบ"

  if (localizedConfig.project) {
    localizedConfig.project = {
      ...localizedConfig.project,
      title: translateText(localizedConfig.project.title),
    }
  }

  // 2. Translate sidebars
  if (localizedConfig.sidebars) {
    localizedConfig.sidebars = localizedConfig.sidebars.map((sidebar) => ({
      ...sidebar,
      title: translateText(sidebar.title),
      items: sidebar.items.map((item) => translateSidebarItem(item, locale)),
    }))
  }

  // 3. Translate breadcrumbs
  if (localizedConfig.breadcrumbOptions?.startItems) {
    localizedConfig.breadcrumbOptions.startItems = localizedConfig.breadcrumbOptions.startItems.map((item) => ({
      ...item,
      title: translateText(item.title),
      link: prefixPath(item.link || "", locale),
    }))
  }

  return localizedConfig
}
