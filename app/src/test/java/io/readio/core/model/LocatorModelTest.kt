package io.readio.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class LocatorModelTest {

    @Test
    fun pdf_locator_keeps_page_based_position() {
        val locator = Locator.Pdf(
            bookId = "book-1",
            format = BookFormat.PDF,
            pageIndex = 3,
            pageOffset = 0.25f
        )

        assertEquals("book-1", locator.bookId)
        assertEquals(BookFormat.PDF, locator.format)
        assertEquals(3, locator.pageIndex)
        assertEquals(0.25f, locator.pageOffset)
    }

    @Test
    fun evidence_anchor_always_carries_a_locator_and_fallback_anchor() {
        val locator = Locator.Textual(
            bookId = "book-1",
            format = BookFormat.EPUB,
            spineId = "chapter-1",
            progression = 0.0,
            contextSnippet = "第1章 风起"
        )
        val evidenceAnchor = EvidenceAnchor(
            quote = "第1章 风起",
            locator = locator,
            chapterTitle = "第1章 风起",
            createdAt = 1_713_654_400_000,
            fallbackAnchor = "chapter-1#第1章 风起"
        )

        assertEquals("第1章 风起", evidenceAnchor.quote)
        assertEquals(locator, evidenceAnchor.locator)
        assertEquals("第1章 风起", evidenceAnchor.chapterTitle)
        assertEquals(1_713_654_400_000, evidenceAnchor.createdAt)
        assertEquals("chapter-1#第1章 风起", evidenceAnchor.fallbackAnchor)
        assertEquals("chapter-1", (evidenceAnchor.locator as Locator.Textual).spineId)
        assertEquals(0.0, (evidenceAnchor.locator as Locator.Textual).progression, 0.0)
        assertEquals("第1章 风起", (evidenceAnchor.locator as Locator.Textual).contextSnippet)
    }
}
