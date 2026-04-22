package io.readio.feature.pdf

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val pdfSpikeAssetPath = "fixtures/readio_spike.pdf"

private sealed interface PdfSpikeUiState {
    data object Loading : PdfSpikeUiState
    data class Loaded(val result: PdfProbeResult) : PdfSpikeUiState
    data class Error(val message: String) : PdfSpikeUiState
}

@Composable
fun PdfSpikeScreen() {
    val context = LocalContext.current
    var uiState by remember(context) { mutableStateOf<PdfSpikeUiState>(PdfSpikeUiState.Loading) }

    LaunchedEffect(context) {
        uiState = try {
            val result = withContext(Dispatchers.IO) {
                PdfDocumentGateway(context).openAsset(pdfSpikeAssetPath)
            }
            PdfSpikeUiState.Loaded(result)
        } catch (_: IllegalStateException) {
            PdfSpikeUiState.Error("PDF probe failed")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        when (val state = uiState) {
            PdfSpikeUiState.Loading -> {
                Text("Loading PDF probe...")
            }

            is PdfSpikeUiState.Loaded -> {
                Text("PDF pages: ${state.result.pageCount}")
                Text("First page size: ${state.result.firstPageWidth} x ${state.result.firstPageHeight}")
                Text("Probe note: record whether PDF is good enough for M1 compatibility only, or should move to M1.1.")
            }

            is PdfSpikeUiState.Error -> {
                Text(state.message)
            }
        }
    }
}
