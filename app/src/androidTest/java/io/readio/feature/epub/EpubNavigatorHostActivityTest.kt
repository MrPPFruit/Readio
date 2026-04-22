package io.readio.feature.epub

import android.os.SystemClock
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EpubNavigatorHostActivityTest {
    @Test
    fun host_proves_real_jump_and_return_sequence() {
        runBlocking {
            val context = ApplicationProvider.getApplicationContext<android.content.Context>()
            val engine = ReadiumEpubEngine(context)
            val publication = engine.openPublication("fixtures/readio_spike.epub")

            try {
                val firstLink = publication.readingOrder[0]
                val secondLink = publication.readingOrder[1]
                val scenario = launchHostScenario(context, secondLink.href.toString(), secondLink.title ?: "第2章 余波")

                try {
                    awaitSequence(scenario)
                    assertSequenceState(scenario, firstLink.href.toString(), secondLink.href.toString())
                } finally {
                    scenario.close()
                }
            } finally {
                publication.close()
            }
        }
    }

    @Test
    fun host_recreates_and_still_returns_to_pre_jump_href() {
        runBlocking {
            val context = ApplicationProvider.getApplicationContext<android.content.Context>()
            val engine = ReadiumEpubEngine(context)
            val publication = engine.openPublication("fixtures/readio_spike.epub")

            try {
                val firstLink = publication.readingOrder[0]
                val secondLink = publication.readingOrder[1]
                val scenario = launchHostScenario(context, secondLink.href.toString(), secondLink.title ?: "第2章 余波")

                try {
                    SystemClock.sleep(300)
                    scenario.recreate()
                    awaitSequence(scenario)
                    assertSequenceState(scenario, firstLink.href.toString(), secondLink.href.toString())
                } finally {
                    scenario.close()
                }
            } finally {
                publication.close()
            }
        }
    }

    private fun launchHostScenario(
        context: android.content.Context,
        targetHref: String,
        title: String,
    ): ActivityScenario<EpubNavigatorHostActivity> = ActivityScenario.launch(
        EpubNavigatorHostActivity.intent(
            context = context,
            assetPath = "fixtures/readio_spike.epub",
            locator = Locator.Textual(
                bookId = "readio-spike-epub",
                format = BookFormat.EPUB,
                spineId = targetHref,
                progression = 0.0,
                contextSnippet = title,
            ),
        ),
    )

    private fun awaitSequence(scenario: ActivityScenario<EpubNavigatorHostActivity>) {
        var fragmentRef: EpubNavigatorHostFragment? = null
        scenario.onActivity { activity ->
            fragmentRef = activity.fragment
        }
        requireNotNull(fragmentRef).awaitNavigatorSequence(timeoutMs = 10_000)
    }

    private fun assertSequenceState(
        scenario: ActivityScenario<EpubNavigatorHostActivity>,
        firstHref: String,
        secondHref: String,
    ) {
        scenario.onActivity { activity ->
            val fragment = activity.fragment
            val evidenceAnchor = requireNotNull(fragment.evidenceAnchor)
            assertEquals(secondHref, (evidenceAnchor.locator as Locator.Textual).spineId)
            assertNotEquals(
                fragment.preJumpReadiumLocator?.href?.toString(),
                fragment.lastJumpReadiumLocator?.href?.toString(),
            )
            assertEquals(secondHref, fragment.lastJumpReadiumLocator?.href?.toString())
            assertEquals(firstHref, fragment.preJumpReadiumLocator?.href?.toString())
            assertEquals(firstHref, fragment.returnedReadiumLocator?.href?.toString())
            assertEquals(firstHref, fragment.latestReadiumLocator?.href?.toString())
            assertNotNull(fragment.latestSharedLocator)
        }
    }
}
