package io.readio.navigation

sealed class SpikeDestination(val route: String) {
    data object Home : SpikeDestination("home")
    data object Epub : SpikeDestination("epub")
    data object Txt : SpikeDestination("txt")
    data object Pdf : SpikeDestination("pdf")
}
