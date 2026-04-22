package io.readio.feature.epub

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReadiumEpubEngineTest {
    @Test
    fun opens_fixture_epub_and_extracts_minimal_probe_data() = runBlocking {
        val engine = ReadiumEpubEngine(ApplicationProvider.getApplicationContext())

        val result = engine.open("fixtures/readio_spike.epub")

        assertTrue(result.tableOfContents.isNotEmpty())
        assertTrue(result.spineItemCount >= 2)
        assertNotNull(result.firstLocator)
        assertTrue(result.firstLocator.progression in 0.0..1.0)
    }

    @Test
    fun converts_first_locator_using_opened_publication_metadata() = runBlocking {
        val engine = ReadiumEpubEngine(ApplicationProvider.getApplicationContext())

        val result = engine.open("fixtures/readio_spike_html.epub")
        val readiumLocator = engine.toReadiumLocator(result.firstLocator)
        val publication = engine.openPublication("fixtures/readio_spike_html.epub")
        val firstLink = publication.readingOrder.first()

        try {
            assertEquals(result.firstSpineHref, readiumLocator.href.toString())
            assertEquals(result.firstLocator.progression, readiumLocator.locations.progression)
            assertEquals(firstLink.mediaType.toString(), readiumLocator.mediaType.toString())
        } finally {
            publication.close()
        }
    }

    @Test
    fun round_trips_first_locator_back_into_readium_locator() = runBlocking {
        val engine = ReadiumEpubEngine(ApplicationProvider.getApplicationContext())

        val first = engine.open("fixtures/readio_spike_html.epub")
        val reopened = engine.toReadiumLocator(first.firstLocator)

        assertEquals(first.firstSpineHref, reopened.href.toString())
        assertNotNull(reopened.locations.progression)
        assertEquals(first.firstLocator.progression, reopened.locations.progression!!, 0.0001)
    }
}
