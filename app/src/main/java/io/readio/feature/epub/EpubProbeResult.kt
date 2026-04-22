package io.readio.feature.epub

import io.readio.core.model.Locator

data class EpubProbeResult(
    val tableOfContents: List<String>,
    val spineItemCount: Int,
    val firstSpineHref: String,
    val firstLocator: Locator.Textual,
)
