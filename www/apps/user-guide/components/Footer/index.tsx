"use client"

import { Footer as UiFooter } from "docs-ui"
import Feedback from "../Feedback"
import EditButton from "../EditButton"
import { LanguageSwitcherInline } from "../LanguageSwitcher"

const Footer = () => {
  return (
    <>
      <UiFooter
        showPagination={true}
        feedbackComponent={<Feedback className="my-2" />}
        editComponent={<EditButton />}
      />
      {/* The nav dropdown holding the switcher is desktop-only, so the footer
      carries it for smaller screens. */}
      <LanguageSwitcherInline className="lg:hidden my-docs_1" />
    </>
  )
}

export default Footer
