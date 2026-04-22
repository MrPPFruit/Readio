package io.readio.feature.txt

object TxtChapterParser {
    private val headingRegex = Regex("^第[0-9一二三四五六七八九十百千零两]+章.*$")

    fun parse(input: String): List<TxtChapter> {
        val lines = input.lines()
        val headingIndexes = lines.mapIndexedNotNull { index, line ->
            index.takeIf { headingRegex.matches(line.trim()) }
        }

        if (headingIndexes.isEmpty()) {
            return listOf(TxtChapter(title = "全文", body = trimBoundaryBlankLines(lines).joinToString("\n")))
        }

        return headingIndexes.mapIndexed { index, startIndex ->
            val endIndex = headingIndexes.getOrElse(index + 1) { lines.size }
            val title = lines[startIndex].trim()
            val bodyLines = lines.subList(startIndex + 1, endIndex)
            val body = trimBoundaryBlankLines(bodyLines).joinToString("\n")
            TxtChapter(title = title, body = body)
        }
    }

    private fun trimBoundaryBlankLines(lines: List<String>): List<String> {
        val start = lines.indexOfFirst { it.isNotBlank() }
        if (start == -1) return emptyList()
        val end = lines.indexOfLast { it.isNotBlank() }
        return lines.subList(start, end + 1)
    }
}
