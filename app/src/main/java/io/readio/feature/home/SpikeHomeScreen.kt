package io.readio.feature.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SpikeHomeScreen(onOpen: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Readio M0 Spikes", style = MaterialTheme.typography.headlineMedium)
        Button(onClick = { onOpen("epub") }) { Text("EPUB Spike") }
        Button(onClick = { onOpen("txt") }) { Text("TXT Spike") }
        Button(onClick = { onOpen("pdf") }) { Text("PDF Spike") }
    }
}
