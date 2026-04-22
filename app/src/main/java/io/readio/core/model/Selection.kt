package io.readio.core.model

data class Selection(
    val selectedText: String,
    val locator: Locator,
    val startAnchor: String? = null,
    val endAnchor: String? = null,
    val contextBefore: String = "",
    val contextAfter: String = "",
)
