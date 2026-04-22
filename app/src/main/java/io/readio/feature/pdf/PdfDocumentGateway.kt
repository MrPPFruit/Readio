package io.readio.feature.pdf

import android.content.Context
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import io.readio.core.io.AssetCopier

class PdfDocumentGateway(
    context: Context,
    private val assetCopier: AssetCopier = AssetCopier(context),
) {
    fun openAsset(assetPath: String): PdfProbeResult {
        try {
            val file = assetCopier.copyToCache(assetPath)
            val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)

            descriptor.use {
                PdfRenderer(it).use { renderer ->
                    val pageCount = renderer.pageCount
                    check(pageCount > 0) {
                        "Cannot probe PDF asset at $assetPath because it has no pages"
                    }

                    val firstPage = renderer.openPage(0)
                    firstPage.use { page ->
                        return PdfProbeResult(
                            pageCount = pageCount,
                            firstPageWidth = page.width,
                            firstPageHeight = page.height,
                        )
                    }
                }
            }
        } catch (error: Exception) {
            throw IllegalStateException("Failed to open PDF asset at $assetPath", error)
        }
    }
}
