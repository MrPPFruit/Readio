package io.readio.core.io

import android.content.Context
import java.io.File

class AssetCopier(
    private val context: Context,
) {
    fun copyToCache(assetPath: String): File {
        val destination = File(context.cacheDir, assetPath.substringAfterLast('/'))
        context.assets.open(assetPath).use { input ->
            destination.outputStream().use { output ->
                input.copyTo(output)
            }
        }
        return destination
    }
}
