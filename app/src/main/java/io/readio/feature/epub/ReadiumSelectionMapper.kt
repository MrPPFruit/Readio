package io.readio.feature.epub

import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import io.readio.core.model.Selection

class ReadiumSelectionMapper {
    fun map(
        bookId: String,
        selectedText: String,
        href: String,
        progression: Double,
        startAnchor: String? = null,
        endAnchor: String? = null,
    ): Selection = Selection(
        selectedText = selectedText,
        locator = Locator.Textual(
            bookId = bookId,
            format = BookFormat.EPUB,
            spineId = href,
            progression = progression,
            contextSnippet = selectedText,
        ),
        startAnchor = startAnchor,
        endAnchor = endAnchor,
    )
}
