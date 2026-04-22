package io.readio.feature.epub

import io.readio.core.model.Locator
import org.readium.r2.shared.publication.Publication

interface EpubEngine {
    suspend fun open(assetPath: String): EpubProbeResult

    suspend fun openPublication(assetPath: String): Publication

    suspend fun toReadiumLocator(locator: Locator.Textual): org.readium.r2.shared.publication.Locator
}
