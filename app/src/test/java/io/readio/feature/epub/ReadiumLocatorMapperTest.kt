package io.readio.feature.epub

import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import org.junit.Assert.assertEquals
import org.junit.Test

class ReadiumLocatorMapperTest {

    @Test
    fun maps_readium_locator_into_shared_textual_locator() {
        val readium = ReadiumLocatorSnapshot(
            bookId = "book-1",
            href = "chapter1.xhtml",
            progression = 0.42,
            text = "林深第一次看见那盏旧灯。",
        )

        val mapped = ReadiumLocatorMapper().map(readium)

        assertEquals(
            Locator.Textual(
                bookId = "book-1",
                format = BookFormat.EPUB,
                spineId = "chapter1.xhtml",
                progression = 0.42,
                contextSnippet = "林深第一次看见那盏旧灯。",
            ),
            mapped,
        )
    }
}
