package io.readio.feature.txt

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

private const val txtSpikeAssetPath = "fixtures/readio_spike.txt"

@Composable
fun TxtSpikeScreen() {
    val context = LocalContext.current
    val chapters = remember(context) { loadTxtChapters(context) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (chapters == null) {
            Text("TXT sample unavailable", style = MaterialTheme.typography.headlineMedium)
            Text("Could not load $txtSpikeAssetPath")
            return@Column
        }

        Text("TXT chapters: ${chapters.size}", style = MaterialTheme.typography.headlineMedium)
        chapters.forEach { chapter ->
            Text(chapter.title, style = MaterialTheme.typography.titleMedium)
            Text(chapter.body)
        }
    }
}

private fun loadTxtChapters(context: Context): List<TxtChapter>? {
    return runCatching {
        val text = context.assets.open(txtSpikeAssetPath)
            .bufferedReader()
            .use { it.readText() }
        TxtChapterParser.parse(text)
    }.getOrNull()
}
