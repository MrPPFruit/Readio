package io.readio.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import io.readio.feature.epub.EpubSpikeScreen
import io.readio.feature.home.SpikeHomeScreen
import io.readio.feature.pdf.PdfSpikeScreen
import io.readio.feature.txt.TxtSpikeScreen

@Composable
fun SpikeNavHost() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = SpikeDestination.Home.route) {
        composable(SpikeDestination.Home.route) {
            SpikeHomeScreen(onOpen = navController::navigate)
        }
        composable(SpikeDestination.Epub.route) { EpubSpikeScreen() }
        composable(SpikeDestination.Txt.route) { TxtSpikeScreen() }
        composable(SpikeDestination.Pdf.route) { PdfSpikeScreen() }
    }
}
