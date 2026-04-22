package io.readio.core.model

import android.net.Uri

data class BookRef(
    val id: String,
    val title: String,
    val format: BookFormat,
    val sourceUri: Uri,
    val sourceType: String,
)
