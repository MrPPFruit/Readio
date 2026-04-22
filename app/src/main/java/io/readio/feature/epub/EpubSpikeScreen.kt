package io.readio.feature.epub

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import io.readio.core.model.EvidenceAnchor
import io.readio.core.model.Locator

private const val epubSpikeAssetPath = "fixtures/readio_spike.epub"

@Composable
fun EpubSpikeScreen() {
    val context = LocalContext.current
    var result by remember(context) { mutableStateOf<EpubProbeResult?>(null) }
    var errorMessage by remember(context) { mutableStateOf<String?>(null) }
    var debugLocator by remember(context) { mutableStateOf<String?>(null) }
    var readiumLocator by remember(context) { mutableStateOf<String?>(null) }
    var evidenceAnchor by remember(context) { mutableStateOf<String?>(null) }
    var navigatorProbe by remember(context) { mutableStateOf<EpubNavigatorProbeResult?>(null) }
    var pendingProbeIntent by remember(context) { mutableStateOf<android.content.Intent?>(null) }
    val probeLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { activityResult ->
        navigatorProbe = EpubNavigatorHostActivity.parseProbeResult(activityResult.data)
    }

    LaunchedEffect(context) {
        try {
            val engine = ReadiumEpubEngine(context)
            val loaded = engine.open(epubSpikeAssetPath)
            val publication = engine.openPublication(epubSpikeAssetPath)
            val requestedLocator = try {
                val targetLink = publication.readingOrder.getOrNull(1)
                    ?: throw IllegalStateException("Publication needs at least two reading-order items")
                Locator.Textual(
                    bookId = loaded.firstLocator.bookId,
                    format = loaded.firstLocator.format,
                    spineId = targetLink.href.toString(),
                    progression = 0.0,
                    contextSnippet = targetLink.title ?: loaded.tableOfContents.getOrNull(1) ?: loaded.firstLocator.contextSnippet,
                )
            } finally {
                publication.close()
            }
            val convertedReadiumLocator = engine.toReadiumLocator(requestedLocator)
            val mappedLocator = ReadiumLocatorMapper().map(
                ReadiumLocatorSnapshot(
                    bookId = requestedLocator.bookId,
                    href = convertedReadiumLocator.href.toString(),
                    progression = convertedReadiumLocator.locations.progression ?: requestedLocator.progression,
                    text = convertedReadiumLocator.text.highlight
                        ?: convertedReadiumLocator.text.after
                        ?: requestedLocator.contextSnippet,
                ),
            )
            val syntheticEvidenceAnchor = EvidenceAnchor(
                quote = "synthetic:${requestedLocator.spineId}",
                locator = mappedLocator,
                chapterTitle = requestedLocator.contextSnippet ?: requestedLocator.spineId,
                createdAt = 0L,
                fallbackAnchor = "${requestedLocator.spineId}#synthetic",
            )

            result = loaded
            debugLocator = mappedLocator.toDebugString()
            readiumLocator = convertedReadiumLocator.toString()
            evidenceAnchor = syntheticEvidenceAnchor.toString()
            pendingProbeIntent = EpubNavigatorHostActivity.probeIntent(
                context,
                epubSpikeAssetPath,
                requestedLocator,
            )
            errorMessage = null
        } catch (_: IllegalStateException) {
            result = null
            debugLocator = null
            readiumLocator = null
            evidenceAnchor = null
            navigatorProbe = null
            pendingProbeIntent = null
            errorMessage = "EPUB probe failed"
        }
    }

    LaunchedEffect(pendingProbeIntent) {
        val intent = pendingProbeIntent ?: return@LaunchedEffect
        pendingProbeIntent = null
        probeLauncher.launch(intent)
    }

    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("EPUB Spike")
        when {
            result != null -> {
                val loaded = result ?: return@Column
                Text("TOC count: ${loaded.tableOfContents.size}")
                Text("Spine items: ${loaded.spineItemCount}")
                Text("First href: ${loaded.firstSpineHref}")
                Text("First locator: ${loaded.firstLocator}")
                Text("Mapped locator: ${debugLocator ?: "none"}")
                Text("Readium locator: ${readiumLocator ?: "none"}")
                Text("Evidence anchor: ${evidenceAnchor ?: "none"}")
                Text("Navigator landed locator: ${navigatorProbe?.landedLocator ?: "none"}")
                Text("Pre-jump locator: ${navigatorProbe?.preJumpLocator ?: "none"}")
                Text("Returned locator: ${navigatorProbe?.returnedLocator ?: "none"}")
                Text("Navigator href stable: ${navigatorProbe?.sameHref ?: false}")
                Text("Back-jump href stable: ${navigatorProbe?.returnedToPreJumpHref ?: false}")
            }

            errorMessage != null -> Text(errorMessage!!)
            else -> Text("Loading...")
        }
    }
}

private fun Locator.Textual.toDebugString(): String =
    "Locator.Textual(bookId=$bookId, spineId=$spineId, progression=$progression, contextSnippet=$contextSnippet)"
