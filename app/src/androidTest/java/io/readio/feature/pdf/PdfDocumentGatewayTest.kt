package io.readio.feature.pdf

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PdfDocumentGatewayTest {
    @Test
    fun opens_fixture_pdf_and_reads_page_count() {
        val gateway = PdfDocumentGateway(ApplicationProvider.getApplicationContext())

        val result = gateway.openAsset("fixtures/readio_spike.pdf")

        assertTrue(result.pageCount >= 1)
    }

    @Test
    fun throws_controlled_error_for_missing_asset_path() {
        val gateway = PdfDocumentGateway(ApplicationProvider.getApplicationContext())

        try {
            gateway.openAsset("fixtures/missing.pdf")
            fail("Expected IllegalStateException")
        } catch (error: IllegalStateException) {
            assertTrue(error.message?.contains("fixtures/missing.pdf") == true)
        }
    }
}
