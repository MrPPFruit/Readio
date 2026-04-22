package io.readio.core.model

data class EvidenceAnchor(
    val quote: String,
    val locator: Locator,
    val chapterTitle: String,
    val createdAt: Long,
    val fallbackAnchor: String,
    val checksum: String? = null,
)
