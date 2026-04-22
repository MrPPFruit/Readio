package io.readio.feature.txt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TxtChapterParserTest {
    @Test
    fun detects_chinese_style_chapter_headings() {
        val input = "第1章 风起\n林深第一次看见那盏旧灯。\n\n第2章 夜路\n雨停之后，街口只剩脚步声。"

        val chapters = TxtChapterParser.parse(input)

        assertEquals(2, chapters.size)
        assertEquals("第1章 风起", chapters.first().title)
        assertTrue(chapters.last().body.contains("街口只剩脚步声"))
    }

    @Test
    fun preserves_meaningful_internal_blank_lines_in_chapter_body() {
        val input = "第1章 风起\n第一段。\n\n第二段。\n第2章 夜路\n雨停之后。"

        val chapters = TxtChapterParser.parse(input)

        assertEquals("第一段。\n\n第二段。", chapters.first().body)
    }

    @Test
    fun trims_only_boundary_blank_lines_without_trimming_indented_content() {
        val input = "第1章 风起\n\n  缩进行首段。\n\n第2章 夜路\n雨停之后。"

        val chapters = TxtChapterParser.parse(input)

        assertEquals("  缩进行首段。", chapters.first().body)
    }

    @Test
    fun falls_back_to_single_linear_chapter_when_no_heading_exists() {
        val input = "这是一段连续文本，没有章节标题。"

        val chapters = TxtChapterParser.parse(input)

        assertEquals(1, chapters.size)
        assertEquals("全文", chapters.first().title)
    }
}
