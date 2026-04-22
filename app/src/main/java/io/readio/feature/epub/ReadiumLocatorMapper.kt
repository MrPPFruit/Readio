package io.readio.feature.epub

import io.readio.core.model.BookFormat
import io.readio.core.model.Locator

data class ReadiumLocatorSnapshot(
    val bookId: String,
    val href: String,
    val progression: Double,
    val text: String? = null,
)

class ReadiumLocatorMapper {
    fun map(snapshot: ReadiumLocatorSnapshot): Locator.Textual = Locator.Textual(
        bookId = snapshot.bookId,
        format = BookFormat.EPUB,
        spineId = snapshot.href,
        progression = snapshot.progression,
        contextSnippet = snapshot.text,
    )
}
