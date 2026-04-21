package io.readio.navigation

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import io.readio.feature.home.SpikeHomeScreen

@Composable
fun SpikeNavHost() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = SpikeDestination.Home.route) {
        composable(SpikeDestination.Home.route) {
            SpikeHomeScreen(onOpen = navController::navigate)
        }
        composable(SpikeDestination.Epub.route) { Text("EPUB Spike TODO") }
        composable(SpikeDestination.Txt.route) { Text("TXT Spike TODO") }
        composable(SpikeDestination.Pdf.route) { Text("PDF Spike TODO") }
    }
}
