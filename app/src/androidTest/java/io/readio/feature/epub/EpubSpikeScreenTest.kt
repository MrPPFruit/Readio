package io.readio.feature.epub

import android.content.Context
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import io.readio.MainActivity
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test

class EpubSpikeScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun epub_spike_screen_shows_real_navigator_probe_data() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val engine = ReadiumEpubEngine(context)
        val publication = runBlocking { engine.openPublication("fixtures/readio_spike.epub") }

        try {
            val firstHref = publication.readingOrder.first().href.toString()
            val secondHref = publication.readingOrder[1].href.toString()

            composeRule.onNodeWithText("EPUB Spike").performClick()

            composeRule.waitUntil(timeoutMillis = 20_000) {
                runCatching {
                    composeRule.onAllNodesWithText("Navigator href stable: true").fetchSemanticsNodes().isNotEmpty()
                }.getOrDefault(false)
            }

            composeRule.onNodeWithText("Mapped locator: Locator.Textual(bookId=fixtures/readio_spike.epub, spineId=$secondHref", substring = true).assertIsDisplayed()
            composeRule.onNodeWithText("Evidence anchor: ", substring = true).performScrollTo().assertIsDisplayed()
            composeRule.onNodeWithText("EvidenceAnchor(quote=synthetic:$secondHref", substring = true).performScrollTo().assertIsDisplayed()
            composeRule.onNodeWithText("Readium locator: Locator(href=$secondHref", substring = true).performScrollTo().assertIsDisplayed()
            composeRule.onNodeWithText("Navigator landed locator: Locator(href=$secondHref", substring = true).performScrollTo().assertIsDisplayed()
            composeRule.onNodeWithText("Pre-jump locator: Locator(href=$firstHref", substring = true).performScrollTo().assertIsDisplayed()
            composeRule.onNodeWithText("Returned locator: Locator(href=$firstHref", substring = true).performScrollTo().assertIsDisplayed()
            composeRule.onNodeWithText("Navigator href stable: true").performScrollTo().assertIsDisplayed()
            composeRule.onNodeWithText("Back-jump href stable: true").performScrollTo().assertIsDisplayed()
            composeRule.onNodeWithText("First href: $firstHref").performScrollTo().assertIsDisplayed()
            composeRule.onAllNodesWithText("Navigator landed locator: none").assertCountEquals(0)
        } finally {
            publication.close()
        }
    }
}
