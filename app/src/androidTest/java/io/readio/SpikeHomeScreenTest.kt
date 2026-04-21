package io.readio

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class SpikeHomeScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun shows_all_spike_entry_points() {
        composeRule.onNodeWithText("Readio M0 Spikes").assertIsDisplayed()
        composeRule.onNodeWithText("EPUB Spike").assertIsDisplayed()
        composeRule.onNodeWithText("TXT Spike").assertIsDisplayed()
        composeRule.onNodeWithText("PDF Spike").assertIsDisplayed()
    }
}
