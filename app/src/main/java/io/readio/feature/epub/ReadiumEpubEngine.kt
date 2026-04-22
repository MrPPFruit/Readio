package io.readio.feature.epub

import android.content.Context
import io.readio.core.io.AssetCopier
import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.Locator as ReadiumLocator
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.shared.util.toUrl
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.DefaultPublicationParser

class ReadiumEpubEngine(
    context: Context,
    private val assetCopier: AssetCopier = AssetCopier(context),
    private val appContext: Context = context.applicationContext,
) : EpubEngine {

    override suspend fun open(assetPath: String): EpubProbeResult {
        val publication = openPublication(assetPath)
        try {
            val firstSpineLink = publication.readingOrder.firstOrNull()
                ?: throw IllegalStateException("Failed to open EPUB asset at $assetPath because it has no spine items")
            val firstSpineHref = firstSpineLink.href.toString()
            val firstLocator = Locator.Textual(
                bookId = assetPath,
                format = BookFormat.EPUB,
                spineId = firstSpineHref,
                progression = 0.0,
            )

            return EpubProbeResult(
                tableOfContents = publication.tableOfContents.map { it.title ?: it.href.toString() },
                spineItemCount = publication.readingOrder.size,
                firstSpineHref = firstSpineHref,
                firstLocator = firstLocator,
            )
        } finally {
            publication.close()
        }
    }

    override suspend fun openPublication(assetPath: String): Publication = withContext(Dispatchers.IO) {
        try {
            val httpClient = DefaultHttpClient()
            val assetRetriever = AssetRetriever(appContext.contentResolver, httpClient)
            val file = assetCopier.copyToCache(assetPath)
            val assetTry = assetRetriever.retrieve(file.toUrl())
            val asset = assetTry.fold(
                { it },
                { error -> throw IllegalStateException("Failed to retrieve EPUB asset at $assetPath: $error") },
            )
            val publicationParser = DefaultPublicationParser(appContext, httpClient, assetRetriever, null)
            val publicationOpener = PublicationOpener(publicationParser, emptyList())
            val publicationTry = publicationOpener.open(asset, allowUserInteraction = true)
            publicationTry.fold(
                { it },
                { error -> throw IllegalStateException("Failed to parse EPUB asset at $assetPath: $error") },
            )
        } catch (error: IllegalStateException) {
            throw error
        } catch (error: Exception) {
            throw IllegalStateException("Failed to open EPUB asset at $assetPath", error)
        }
    }

    override suspend fun toReadiumLocator(locator: Locator.Textual): ReadiumLocator {
        val publication = openPublication(locator.bookId)
        try {
            val link = publication.readingOrder.firstOrNull { it.href.toString() == locator.spineId }
                ?: throw IllegalStateException("Failed to resolve locator href ${locator.spineId} in publication ${locator.bookId}")

            return ReadiumLocator(
                href = Url(locator.spineId) ?: throw IllegalStateException("Invalid locator href: ${locator.spineId}"),
                mediaType = link.mediaType
                    ?: throw IllegalStateException("Missing media type for locator href ${locator.spineId} in publication ${locator.bookId}"),
                title = link.title,
                locations = ReadiumLocator.Locations(progression = locator.progression),
                text = ReadiumLocator.Text(),
            )
        } finally {
            publication.close()
        }
    }
}
