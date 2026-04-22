package io.readio.core.model

sealed interface Locator {
    val bookId: String
    val format: BookFormat

    data class Textual(
        override val bookId: String,
        override val format: BookFormat,
        val spineId: String,
        val progression: Double,
        val contextSnippet: String? = null,
    ) : Locator

    data class Pdf(
        override val bookId: String,
        override val format: BookFormat,
        val pageIndex: Int,
        val pageOffset: Float,
    ) : Locator
}
