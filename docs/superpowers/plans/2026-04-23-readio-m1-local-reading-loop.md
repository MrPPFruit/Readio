# Readio M1 本地阅读闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Android 上交付 Readio M1 本地阅读闭环：本地导入、书架、继续阅读、EPUB/TXT 主阅读、PDF 有界兼容、基础阅读设置，以及源文件/权限失效时的恢复链路。

**Architecture:** 保留 M0 已证明的运行时底座：`core/model` 继续承担跨格式契约，Readium 继续作为 EPUB runtime，`TxtChapterParser` 继续作为 TXT 章节切分起点，`PdfDocumentGateway` 继续作为 PDF compatibility gateway。M1 新增产品壳层与持久化层：`feature/library`、`feature/import`、`feature/reader`、`feature/settings` 负责用户流程，`data/db` 与 `data/settings` 负责 Room/DataStore 持久化，恢复语义统一遵循“最近可信位置”原则；EPUB 明确只承诺 safe restart 级别恢复，不承诺 recreate 中途精确恢复。

**Tech Stack:** Kotlin, Jetpack Compose, Navigation Compose, ViewModel, Room, DataStore, Coroutines/Flow, Readium Kotlin Toolkit 3.1.2, Android SAF/content URI, PdfRenderer, JUnit4, Android instrumented tests.

---

## 锁定决策

这些决策在 M1 计划内直接视为已冻结，不再反复讨论：

1. **范围只做 M1 本地阅读闭环**：不引入 AI、搜书、账号、同步、社区、深度 PDF。
2. **一级导航只有两个入口**：`书架`、`设置`。
3. **默认阅读交互为滚动优先**：翻页模式不进入 M1 阻塞范围。
4. **格式优先级**：EPUB/TXT 是主路径，PDF 只做 bounded compatibility path。
5. **文件访问策略**：以 `ACTION_OPEN_DOCUMENT` + `content://` 为标准入口；优先持久化 URI 权限，但不能把 grant 误当成永远可读的绝对路径。
6. **导入后的 canonical source 规则**：`Book.id` 始终使用稳定 UUID，绝不使用 asset path、临时文件路径或 `content://` 字符串本身；`sourceUri + sourceType` 才表示真实来源，必要时允许把导入结果 materialize 到 app 私有目录。
7. **运行时 source normalization 是 M1 前置条件**：M0 已证明的 `ReadiumEpubEngine` / `PdfDocumentGateway` 目前是 asset-path 路线；进入 M1 后必须先补一层导入源适配，把持久化来源转换成 Readium / PdfRenderer 真正能稳定打开的 source，再接书架与 reader。
8. **恢复语义**：
   - EPUB：恢复到最近可信 `Locator.Textual`，失败时降级到同 spine 起点，再失败降级到首个可打开位置。
   - TXT：恢复到章节 + 进度，结构漂移时降级到章节标题，再失败降级到全文线性位置。
   - PDF：恢复到 `pageIndex + pageOffset`，失败时降级到最近合法页。
9. **主指标**：`继续阅读回访率`。
10. **次指标**：`周阅读时长`。
11. **工程健康门槛**：
   - 首本书导入到开读中位耗时 `< 3 分钟`
   - EPUB/TXT 打开成功率 `> 98%`
   - 继续阅读恢复成功率 `> 95%`

---

## 参考依据

实现前先读这些文件，不要按猜测开工：

- 规格：`docs/superpowers/specs/2026-04-21-readio-mvp-design.md`
- 路线冻结：`docs/superpowers/specs/2026-04-21-readio-route-lock-v1.md`
- M1 UI / 交互设计：`docs/superpowers/specs/2026-04-23-readio-m1-ui-interaction-design.md`
- EPUB 边界：`docs/adr/ADR-001-readium-epub-spike.md`
- TXT 边界：`docs/adr/ADR-002-txt-model-and-fallback.md`
- PDF 边界：`docs/adr/ADR-003-pdf-boundary.md`
- Shared model 边界：`docs/adr/ADR-004-shared-locator-model.md`
- 当前交接：`HANDOFF.md`

Android / Readium 外部依据：

- Android SAF / persisted URI permission
- Android `UriPermission` / `ContentResolver`
- Readium `open-publication` 与 navigator 文档（3.1.2）

---

## 计划文件结构

### 继续复用的现有文件

- `app/src/main/java/io/readio/core/model/BookFormat.kt` — 书籍格式枚举
- `app/src/main/java/io/readio/core/model/Locator.kt` — 跨格式位置语义
- `app/src/main/java/io/readio/core/model/Selection.kt` — 未来 M2 的选区契约，M1 不扩写 runtime 承诺
- `app/src/main/java/io/readio/core/model/EvidenceAnchor.kt` — 未来 M2 证据锚点契约，M1 只保留定义
- `app/src/main/java/io/readio/feature/epub/ReadiumEpubEngine.kt` — EPUB 打开与 locator 转换适配器
- `app/src/main/java/io/readio/feature/epub/ReadiumLocatorMapper.kt` — Readium locator -> app locator 映射
- `app/src/main/java/io/readio/feature/txt/TxtChapterParser.kt` — TXT 章节切分起点
- `app/src/main/java/io/readio/feature/pdf/PdfDocumentGateway.kt` — PDF 元数据/打开 gateway

### M1 新增的产品层文件

- `app/src/main/java/io/readio/ReadioApp.kt` — Application 入口，持有全局依赖容器
- `app/src/main/java/io/readio/di/ReadioAppContainer.kt` — 最小依赖装配，不引入完整 DI 框架
- `app/src/main/java/io/readio/core/model/Book.kt` — 书架层书籍实体，区分 persisted source 与 runtime source
- `app/src/main/java/io/readio/core/model/ReadingProgress.kt` — 持久化阅读进度实体
- `app/src/main/java/io/readio/core/model/ReaderSettings.kt` — 字号/行距/主题等设置
- `app/src/main/java/io/readio/core/model/ImportFailure.kt` — 导入/打开失败分类
- `app/src/main/java/io/readio/navigation/ReadioDestination.kt` — 正式产品路由
- `app/src/main/java/io/readio/navigation/ReadioNavHost.kt` — 正式产品导航壳
- `app/src/main/java/io/readio/feature/library/LibraryUiState.kt`
- `app/src/main/java/io/readio/feature/library/LibraryViewModel.kt`
- `app/src/main/java/io/readio/feature/library/LibraryScreen.kt`
- `app/src/main/java/io/readio/feature/library/ContinueReadingCard.kt`
- `app/src/main/java/io/readio/feature/library/LibraryBooksGrid.kt` — 书架“全部书籍”2 列网格与多书切换入口
- `app/src/main/java/io/readio/feature/library/LibraryTopHero.kt` — 书架首屏主引导区，承载空状态 / 首本阅读引导 / 继续阅读三态
- `app/src/main/java/io/readio/feature/settings/SettingsViewModel.kt`
- `app/src/main/java/io/readio/feature/settings/SettingsScreen.kt`
- `app/src/main/java/io/readio/feature/pdf/PdfCapabilityCopy.kt` — 统一管理 PDF bounded compatibility 的用户文案
- `app/src/main/java/io/readio/feature/library/ImportLoadingOverlay.kt` — 导入中的页面级轻遮罩
- `app/src/main/java/io/readio/feature/import/ImportCoordinator.kt`
- `app/src/main/java/io/readio/feature/import/ImportSourceStrategy.kt`
- `app/src/main/java/io/readio/feature/import/ImportedBookPayload.kt`
- `app/src/main/java/io/readio/feature/import/BookMetadataExtractor.kt` — 各格式元数据抽取 seam
- `app/src/main/java/io/readio/feature/import/ImportFailureUiModel.kt` — 失败类型到用户文案/动作的映射
- `app/src/main/java/io/readio/feature/import/ImportFailureUi.kt` — 导入/恢复失败的产品化 UI
- `app/src/main/java/io/readio/feature/import/IncomingBookIntentHandler.kt`
- `app/src/main/java/io/readio/feature/import/SourceRecoveryResolver.kt`
- `app/src/main/java/io/readio/feature/reader/ReaderUiState.kt`
- `app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt`
- `app/src/main/java/io/readio/feature/reader/ReaderScreen.kt`
- `app/src/main/java/io/readio/feature/reader/ReaderChromeState.kt` — 阅读壳状态机
- `app/src/main/java/io/readio/feature/reader/ReaderControls.kt`
- `app/src/main/java/io/readio/feature/reader/ReaderSettingsSheet.kt`
- `app/src/main/java/io/readio/feature/reader/TocDrawer.kt`
- `app/src/main/java/io/readio/feature/reader/ProgressRestorePolicy.kt`
- `app/src/main/java/io/readio/runtime/source/StoredBookSource.kt` — 导入后 canonical source 描述
- `app/src/main/java/io/readio/runtime/source/MaterializedBookSource.kt` — 运行时真正要打开的 source 结果
- `app/src/main/java/io/readio/runtime/source/BookSourceMaterializer.kt` — 把 `content://` / 私有副本转成运行时可打开的 source
- `app/src/main/java/io/readio/runtime/epub/EpubMetadataExtractor.kt`
- `app/src/main/java/io/readio/runtime/epub/EpubReaderFragment.kt`
- `app/src/main/java/io/readio/runtime/epub/EpubReaderScreen.kt`
- `app/src/main/java/io/readio/runtime/txt/TxtMetadataExtractor.kt`
- `app/src/main/java/io/readio/runtime/txt/TxtReaderDocument.kt`
- `app/src/main/java/io/readio/runtime/txt/TxtReaderScreen.kt`
- `app/src/main/java/io/readio/runtime/pdf/PdfMetadataExtractor.kt`
- `app/src/main/java/io/readio/runtime/pdf/PdfReaderScreen.kt`

### M1 新增的数据层文件

- `app/src/main/java/io/readio/data/db/ReadioDatabase.kt`
- `app/src/main/java/io/readio/data/db/BookEntity.kt`
- `app/src/main/java/io/readio/data/db/ReadingProgressEntity.kt`
- `app/src/main/java/io/readio/data/db/BookDao.kt`
- `app/src/main/java/io/readio/data/db/ReadingProgressDao.kt`
- `app/src/main/java/io/readio/data/repository/LibraryRepository.kt`
- `app/src/main/java/io/readio/data/repository/ReadingProgressRepository.kt`
- `app/src/main/java/io/readio/data/db/RoomConverters.kt` — `Uri`/`Locator` 等持久化转换
- `app/src/main/java/io/readio/data/settings/ReaderSettingsStore.kt`

### 计划中将替换为正式产品入口的现有文件

以下文件在 M1 最终 smoke test 通过后应删除或至少不再作为入口引用：

- `app/src/main/java/io/readio/navigation/SpikeDestination.kt`
- `app/src/main/java/io/readio/navigation/SpikeNavHost.kt`
- `app/src/main/java/io/readio/feature/home/SpikeHomeScreen.kt`
- `app/src/main/java/io/readio/feature/epub/EpubSpikeScreen.kt`
- `app/src/main/java/io/readio/feature/txt/TxtSpikeScreen.kt`
- `app/src/main/java/io/readio/feature/pdf/PdfSpikeScreen.kt`
- `app/src/androidTest/java/io/readio/SpikeHomeScreenTest.kt`
- `app/src/androidTest/java/io/readio/feature/epub/EpubSpikeScreenTest.kt`

保留运行时/契约层测试，不保留只服务于 M0 UI 入口的测试。

---

### Task 1: 建立正式产品壳和 M1 核心契约

**Files:**
- Modify: `app/build.gradle.kts`
- Modify: `app/src/main/AndroidManifest.xml`
- Modify: `app/src/main/java/io/readio/MainActivity.kt`
- Create: `app/src/main/java/io/readio/ReadioApp.kt`
- Create: `app/src/main/java/io/readio/di/ReadioAppContainer.kt`
- Create: `app/src/main/java/io/readio/core/model/Book.kt`
- Create: `app/src/main/java/io/readio/core/model/ReadingProgress.kt`
- Create: `app/src/main/java/io/readio/core/model/ReaderSettings.kt`
- Create: `app/src/main/java/io/readio/core/model/ImportFailure.kt`
- Create: `app/src/main/java/io/readio/navigation/ReadioDestination.kt`
- Create: `app/src/main/java/io/readio/navigation/ReadioNavHost.kt`
- Create: `app/src/main/java/io/readio/feature/library/LibraryScreen.kt`
- Create: `app/src/main/java/io/readio/feature/settings/SettingsScreen.kt`
- Test: `app/src/androidTest/java/io/readio/navigation/ReadioNavHostTest.kt`

- [ ] **Step 1: 先写正式导航壳的 failing test**

```kotlin
// app/src/androidTest/java/io/readio/navigation/ReadioNavHostTest.kt
package io.readio.navigation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import io.readio.MainActivity
import org.junit.Rule
import org.junit.Test

class ReadioNavHostTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun shows_library_empty_state_and_settings_entry() {
        composeRule.onNodeWithText("导入本地书籍").assertIsDisplayed()
        composeRule.onNodeWithText("书架").assertIsDisplayed()
        composeRule.onNodeWithText("设置").assertIsDisplayed()
        composeRule.onNodeWithText("支持 EPUB、TXT，支持 PDF 基础阅读，可翻页、缩放与继续阅读").assertIsDisplayed()
    }
}
```

- [ ] **Step 2: 运行测试，确认现在是红的**

Run:
```bash
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.navigation.ReadioNavHostTest
```

Expected:
- FAIL，因为当前 `MainActivity` 仍挂在 `SpikeNavHost()`。

- [ ] **Step 3: 加入 M1 必需依赖与最小实现**

在 `app/build.gradle.kts` 加入：

```kotlin
implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
implementation("androidx.compose.material:material-icons-extended")
```

核心契约先最小落地。Task 1 的 `ReadioAppContainer` 只先作为占位依赖容器存在，**不要**提前引用 Task 2 才会出现的 Room/DataStore 类型；真实 wiring 放到 Task 2 再接：

```kotlin
// app/src/main/java/io/readio/di/ReadioAppContainer.kt
package io.readio.di

class ReadioAppContainer
```

```kotlin
// app/src/main/java/io/readio/ReadioApp.kt
package io.readio

import android.app.Application
import io.readio.di.ReadioAppContainer

class ReadioApp : Application() {
    lateinit var container: ReadioAppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = ReadioAppContainer()
    }
}
```

并在 `AndroidManifest.xml` 上加：

```xml
<application
    android:name=".ReadioApp"
    ... />
```

```kotlin
// app/src/main/java/io/readio/core/model/Book.kt
package io.readio.core.model

import android.net.Uri

data class Book(
    val id: String,
    val title: String,
    val author: String?,
    val format: BookFormat,
    val sourceUri: Uri,
    val sourceType: String,
    val originalUri: Uri? = null,
    val mimeType: String? = null,
    val coverUri: Uri? = null,
    val importedAt: Long,
    val lastOpenedAt: Long? = null,
)
```

```kotlin
// app/src/main/java/io/readio/core/model/ReadingProgress.kt
package io.readio.core.model

data class ReadingProgress(
    val bookId: String,
    val locator: Locator,
    val updatedAt: Long,
)
```

```kotlin
// app/src/main/java/io/readio/core/model/ReaderSettings.kt
package io.readio.core.model

data class ReaderSettings(
    val fontScale: Float = 1.0f,
    val lineHeightScale: Float = 1.0f,
    val darkTheme: Boolean = false,
    val useVerticalScroll: Boolean = true,
)
```

```kotlin
// app/src/main/java/io/readio/navigation/ReadioDestination.kt
package io.readio.navigation

sealed class ReadioDestination(val route: String) {
    data object Library : ReadioDestination("library")
    data object Settings : ReadioDestination("settings")
}
```

```kotlin
// app/src/main/java/io/readio/feature/library/LibraryScreen.kt
package io.readio.feature.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun LibraryScreen(onImportClick: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("书架")
        Text("把你的书导进来")
        Text("支持 EPUB、TXT，支持 PDF 基础阅读，可翻页、缩放与继续阅读")
        Button(onClick = onImportClick) { Text("导入本地书籍") }
        Text("导入成功后会自动开始阅读")
    }
}
```

Task 1 先只落空书架态，但要注意这不是最终书架 UI。后续 Task 5 必须把顶部主引导区升级成三态：
- 无书 -> 空状态
- 有书但无阅读历史 -> `开始阅读你的第一本书`
- 有阅读历史 -> `ContinueReadingCard`


```kotlin
// app/src/main/java/io/readio/feature/settings/SettingsScreen.kt
package io.readio.feature.settings

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable
fun SettingsScreen() {
    Text("设置")
}
```

```kotlin
// app/src/main/java/io/readio/navigation/ReadioNavHost.kt
package io.readio.navigation

import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import io.readio.feature.library.LibraryScreen
import io.readio.feature.settings.SettingsScreen

@Composable
fun ReadioNavHost() {
    val navController = rememberNavController()
    val backStack = navController.currentBackStackEntryAsState()

    Scaffold(
        bottomBar = {
            NavigationBar {
                listOf(ReadioDestination.Library, ReadioDestination.Settings).forEach { destination ->
                    NavigationBarItem(
                        selected = backStack.value?.destination?.route == destination.route,
                        onClick = { navController.navigate(destination.route) },
                        label = { Text(if (destination == ReadioDestination.Library) "书架" else "设置") },
                        icon = { Text("•") },
                    )
                }
            }
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = ReadioDestination.Library.route,
        ) {
            composable(ReadioDestination.Library.route) {
                LibraryScreen(onImportClick = {})
            }
            composable(ReadioDestination.Settings.route) {
                SettingsScreen()
            }
        }
    }
}
```

```kotlin
// app/src/main/java/io/readio/MainActivity.kt
setContent { ReadioNavHost() }
```

- [ ] **Step 4: 重新跑正式导航壳测试**

Run:
```bash
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.navigation.ReadioNavHostTest
```

Expected:
- PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add app/build.gradle.kts app/src/main/AndroidManifest.xml app/src/main/java/io/readio/MainActivity.kt app/src/main/java/io/readio/ReadioApp.kt app/src/main/java/io/readio/di/ReadioAppContainer.kt app/src/main/java/io/readio/core/model/Book.kt app/src/main/java/io/readio/core/model/ReadingProgress.kt app/src/main/java/io/readio/core/model/ReaderSettings.kt app/src/main/java/io/readio/core/model/ImportFailure.kt app/src/main/java/io/readio/navigation/ReadioDestination.kt app/src/main/java/io/readio/navigation/ReadioNavHost.kt app/src/main/java/io/readio/feature/library/LibraryScreen.kt app/src/main/java/io/readio/feature/settings/SettingsScreen.kt app/src/androidTest/java/io/readio/navigation/ReadioNavHostTest.kt

git commit -m "feat: add M1 app shell and core contracts"
```

---

### Task 2: 建立 Room/DataStore 持久化与恢复语义

**Files:**
- Modify: `build.gradle.kts`
- Modify: `app/build.gradle.kts`
- Create: `app/src/main/java/io/readio/data/db/ReadioDatabase.kt`
- Create: `app/src/main/java/io/readio/data/db/BookEntity.kt`
- Create: `app/src/main/java/io/readio/data/db/ReadingProgressEntity.kt`
- Create: `app/src/main/java/io/readio/data/db/BookDao.kt`
- Create: `app/src/main/java/io/readio/data/db/ReadingProgressDao.kt`
- Create: `app/src/main/java/io/readio/data/db/RoomConverters.kt`
- Create: `app/src/main/java/io/readio/data/repository/LibraryRepository.kt`
- Create: `app/src/main/java/io/readio/data/repository/ReadingProgressRepository.kt`
- Create: `app/src/main/java/io/readio/data/settings/ReaderSettingsStore.kt`
- Create: `app/src/main/java/io/readio/feature/reader/ProgressRestorePolicy.kt`
- Test: `app/src/androidTest/java/io/readio/data/LibraryRepositoryTest.kt`
- Test: `app/src/androidTest/java/io/readio/data/settings/ReaderSettingsStoreTest.kt`
- Test: `app/src/test/java/io/readio/feature/reader/ProgressRestorePolicyTest.kt`

- [ ] **Step 1: 先写恢复策略、continue reading 与 DataStore 的 failing tests**

```kotlin
// app/src/test/java/io/readio/feature/reader/ProgressRestorePolicyTest.kt
package io.readio.feature.reader

import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import org.junit.Assert.assertEquals
import org.junit.Test

class ProgressRestorePolicyTest {
    @Test
    fun epub_falls_back_to_same_spine_start_when_exact_locator_cannot_be_replayed() {
        val saved = Locator.Textual(
            bookId = "book-1",
            format = BookFormat.EPUB,
            spineId = "chapter-2.xhtml",
            progression = 0.73,
            contextSnippet = "雨停之后",
        )

        val resolved = ProgressRestorePolicy.resolveEpub(
            saved = saved,
            availableSpineIds = listOf("chapter-1.xhtml", "chapter-2.xhtml"),
            exactReplayAvailable = false,
        )

        assertEquals("chapter-2.xhtml", resolved.spineId)
        assertEquals(0.0, resolved.progression, 0.0)
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/data/LibraryRepositoryTest.kt
package io.readio.data

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import io.readio.data.db.ReadioDatabase
import io.readio.data.repository.LibraryRepository
import io.readio.data.repository.ReadingProgressRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LibraryRepositoryTest {
    @Test
    fun returns_latest_book_with_valid_progress_for_continue_reading() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val db = ReadioDatabase.inMemory(context)
        val libraryRepository = LibraryRepository(db.bookDao(), db.readingProgressDao())
        val progressRepository = ReadingProgressRepository(db.readingProgressDao())

        val importedOnly = libraryRepository.upsertTestBook(id = "a", title = "A", format = BookFormat.EPUB, importedAt = 20)
        val activelyRead = libraryRepository.upsertTestBook(id = "b", title = "B", format = BookFormat.TXT, importedAt = 10)

        progressRepository.save(
            bookId = activelyRead.id,
            locator = Locator.Textual(
                bookId = activelyRead.id,
                format = BookFormat.TXT,
                spineId = "全文",
                progression = 0.3,
            ),
            updatedAt = 30,
        )

        val book = libraryRepository.observeContinueReading().first()
        assertEquals("b", book?.id)
        assertEquals("a", importedOnly.id)
    }

    @Test
    fun round_trips_uri_and_locator_through_room_converters() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val db = ReadioDatabase.inMemory(context)
        val libraryRepository = LibraryRepository(db.bookDao(), db.readingProgressDao())
        val progressRepository = ReadingProgressRepository(db.readingProgressDao())

        val book = libraryRepository.upsertTestBook(
            id = "uri-book",
            title = "带定位",
            format = BookFormat.EPUB,
            importedAt = 1,
            sourceUri = Uri.parse("content://books/uri-book.epub"),
        )
        val locator = Locator.Textual(
            bookId = book.id,
            format = BookFormat.EPUB,
            spineId = "chapter-3.xhtml",
            progression = 0.5,
        )

        progressRepository.save(bookId = book.id, locator = locator, updatedAt = 2)

        val persisted = libraryRepository.observeBooks().first().first { it.id == book.id }
        val persistedProgress = progressRepository.observe(book.id).first()

        assertEquals(Uri.parse("content://books/uri-book.epub"), persisted.sourceUri)
        assertEquals(locator, persistedProgress?.locator)
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/data/settings/ReaderSettingsStoreTest.kt
package io.readio.data.settings

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReaderSettingsStoreTest {
    @Test
    fun persists_font_scale_and_dark_theme() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = ReaderSettingsStore(context, fileName = "reader-settings-test")

        store.update(fontScale = 1.2f, darkTheme = true)
        val settings = store.settings.first()

        assertEquals(1.2f, settings.fontScale)
        assertEquals(true, settings.darkTheme)
    }
}
```

- [ ] **Step 2: 运行测试，确认持久化层还不存在**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.feature.reader.ProgressRestorePolicyTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.data.LibraryRepositoryTest,io.readio.data.settings.ReaderSettingsStoreTest
```

Expected:
- FAIL，因为 `ReadioDatabase`、`LibraryRepository`、`ReaderSettingsStore`、`ProgressRestorePolicy` 还不存在。

- [ ] **Step 3: 加最小持久化实现，不写多余抽象**

先把 Task 1 的占位容器升级成真实 wiring，再补持久化层。此时 `ReadioAppContainer` 改为：

```kotlin
// app/src/main/java/io/readio/di/ReadioAppContainer.kt
package io.readio.di

import android.content.Context
import io.readio.data.db.ReadioDatabase
import io.readio.data.repository.LibraryRepository
import io.readio.data.repository.ReadingProgressRepository
import io.readio.data.settings.ReaderSettingsStore

class ReadioAppContainer(context: Context) {
    private val database = ReadioDatabase.get(context)
    val libraryRepository = LibraryRepository(database.bookDao(), database.readingProgressDao())
    val readingProgressRepository = ReadingProgressRepository(database.readingProgressDao())
    val readerSettingsStore = ReaderSettingsStore(context)
}
```

并把 `ReadioApp` 里的初始化从 `ReadioAppContainer()` 改回 `ReadioAppContainer(this)`。

在根 `build.gradle.kts` 加入 KSP plugin 声明，在 `app/build.gradle.kts` 应用它：

```kotlin
// build.gradle.kts
plugins {
    id("com.android.application") version "8.6.1" apply false
    id("org.jetbrains.kotlin.android") version "2.1.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.21" apply false
    id("com.google.devtools.ksp") version "2.1.21-2.0.1" apply false
}
```

```kotlin
// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}
```

并加入：

```kotlin
implementation("androidx.room:room-runtime:2.6.1")
ksp("androidx.room:room-compiler:2.6.1")
implementation("androidx.room:room-ktx:2.6.1")
implementation("androidx.datastore:datastore-preferences:1.1.1")
testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
```

核心恢复策略只先定义 M1 承诺：

```kotlin
// app/src/main/java/io/readio/feature/reader/ProgressRestorePolicy.kt
package io.readio.feature.reader

import io.readio.core.model.Locator

object ProgressRestorePolicy {
    fun resolveEpub(
        saved: Locator.Textual,
        availableSpineIds: List<String>,
        exactReplayAvailable: Boolean,
    ): Locator.Textual {
        return when {
            exactReplayAvailable -> saved
            saved.spineId in availableSpineIds -> saved.copy(progression = 0.0)
            availableSpineIds.isNotEmpty() -> saved.copy(spineId = availableSpineIds.first(), progression = 0.0)
            else -> saved.copy(progression = 0.0)
        }
    }
}
```

Repository 不搞 use-case 层，先直连，但要把 continue reading 语义钉死为“最新一条有效阅读进度”，不是“最新导入书”：

```kotlin
// app/src/main/java/io/readio/data/repository/LibraryRepository.kt
class LibraryRepository(
    private val bookDao: BookDao,
    private val progressDao: ReadingProgressDao,
) {
    fun observeBooks() = bookDao.observeAll()
    fun observeContinueReading() = bookDao.observeLatestReadBook()
}
```

`BookDao.observeLatestReadBook()` 要基于 `books` 与 `reading_progress` 的 join，按 `ReadingProgressEntity.updatedAt DESC` 取最近一条；如果书还没产生任何 progress，就不能挤掉真正的“继续阅读”候选。

`RoomConverters.kt` 至少负责：
- `Uri <-> String`
- `Locator <-> String`（允许用 `kotlinx.serialization` 或手写最小 JSON 映射，但必须在 `ReadioDatabase` 上显式注册）

`ReaderSettingsStore` 直接包一层真实 `PreferencesDataStore`，不另外造 fake store：测试用单独文件名跑 instrumented test 即可。

- [ ] **Step 4: 把三个测试跑绿**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.feature.reader.ProgressRestorePolicyTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.data.LibraryRepositoryTest,io.readio.data.settings.ReaderSettingsStoreTest
```

Expected:
- PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add build.gradle.kts app/build.gradle.kts app/src/main/java/io/readio/di/ReadioAppContainer.kt app/src/main/java/io/readio/ReadioApp.kt app/src/main/java/io/readio/data/db/ReadioDatabase.kt app/src/main/java/io/readio/data/db/BookEntity.kt app/src/main/java/io/readio/data/db/ReadingProgressEntity.kt app/src/main/java/io/readio/data/db/BookDao.kt app/src/main/java/io/readio/data/db/ReadingProgressDao.kt app/src/main/java/io/readio/data/db/RoomConverters.kt app/src/main/java/io/readio/data/repository/LibraryRepository.kt app/src/main/java/io/readio/data/repository/ReadingProgressRepository.kt app/src/main/java/io/readio/data/settings/ReaderSettingsStore.kt app/src/main/java/io/readio/feature/reader/ProgressRestorePolicy.kt app/src/androidTest/java/io/readio/data/LibraryRepositoryTest.kt app/src/androidTest/java/io/readio/data/settings/ReaderSettingsStoreTest.kt app/src/test/java/io/readio/feature/reader/ProgressRestorePolicyTest.kt

git commit -m "feat: add persistence foundation and restore policy"
```

---

### Task 3: 先建立 source normalization，再实现 EPUB 导入流水线并把书落入本地书架

**Files:**
- Modify: `app/src/main/java/io/readio/feature/library/LibraryScreen.kt`
- Create: `app/src/main/java/io/readio/feature/library/LibraryUiState.kt`
- Create: `app/src/main/java/io/readio/feature/library/LibraryViewModel.kt`
- Create: `app/src/main/java/io/readio/feature/library/ImportLoadingOverlay.kt`
- Create: `app/src/main/java/io/readio/feature/import/ImportCoordinator.kt`
- Create: `app/src/main/java/io/readio/feature/import/ImportSourceStrategy.kt`
- Create: `app/src/main/java/io/readio/feature/import/ImportedBookPayload.kt`
- Create: `app/src/main/java/io/readio/feature/import/BookMetadataExtractor.kt`
- Create: `app/src/main/java/io/readio/runtime/source/StoredBookSource.kt`
- Create: `app/src/main/java/io/readio/runtime/source/MaterializedBookSource.kt`
- Create: `app/src/main/java/io/readio/runtime/source/BookSourceMaterializer.kt`
- Create: `app/src/main/java/io/readio/runtime/epub/EpubMetadataExtractor.kt`
- Modify: `app/src/main/java/io/readio/feature/epub/EpubEngine.kt`
- Modify: `app/src/main/java/io/readio/feature/epub/ReadiumEpubEngine.kt`
- Modify: `app/src/main/java/io/readio/feature/pdf/PdfDocumentGateway.kt`
- Modify: `app/src/main/java/io/readio/navigation/ReadioNavHost.kt`
- Create: `app/src/main/java/io/readio/feature/import/ImportFailureUiModel.kt`
- Create: `app/src/androidTest/java/io/readio/test/ImportTestHarness.kt`
- Test: `app/src/test/java/io/readio/feature/import/ImportCoordinatorTest.kt`
- Test: `app/src/test/java/io/readio/runtime/source/BookSourceMaterializerTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/import/ImportFailureUiTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/import/ImportFlowTest.kt`

- [ ] **Step 1: 先写 source normalization、EPUB 导入协调器和导入失败 UI 的 failing tests**

```kotlin
// app/src/test/java/io/readio/runtime/source/BookSourceMaterializerTest.kt
package io.readio.runtime.source

import android.net.Uri
import org.junit.Assert.assertTrue
import org.junit.Test

class BookSourceMaterializerTest {
    @Test
    fun copies_epub_content_uri_into_app_private_file_when_runtime_needs_file_access() {
        val materializer = BookSourceMaterializer(
            filesDir = createTempDir(),
            contentReader = ContentReader { "epub-bytes".byteInputStream() },
        )
        val source = StoredBookSource.ContentUri(
            originalUri = Uri.parse("content://books/novel.epub"),
            uri = Uri.parse("content://books/novel.epub"),
            mimeType = "application/epub+zip",
        )

        val materialized = materializer.materialize(source)

        assertTrue(materialized.runtimeUri.toString().startsWith("file:"))
    }
}
```

```kotlin
// app/src/test/java/io/readio/feature/import/ImportCoordinatorTest.kt
package io.readio.feature.import

import android.net.Uri
import io.readio.core.model.BookFormat
import io.readio.runtime.source.StoredBookSource
import org.junit.Assert.assertEquals
import org.junit.Test

class ImportCoordinatorTest {
    @Test
    fun imports_epub_into_local_library_record() {
        val fakeUri = Uri.parse("content://books/novel.epub")
        var persisted: io.readio.core.model.Book? = null
        val coordinator = ImportCoordinator(
            sourceStrategy = FakeImportSourceStrategy(
                storedBookSource = StoredBookSource.PrivateFile(
                    originalUri = fakeUri,
                    filePath = "/data/user/0/io.readio/files/books/novel.epub",
                    mimeType = "application/epub+zip",
                )
            ),
            materializer = BookSourceMaterializer(
                filesDir = createTempDir(),
                contentReader = ContentReader { null },
            ),
            metadataExtractor = FakeBookMetadataExtractor(title = "风起", author = "某某", format = BookFormat.EPUB),
            persistBook = { persisted = it },
        )

        val book = coordinator.import(uri = fakeUri, mimeType = "application/epub+zip")

        assertEquals(BookFormat.EPUB, book.format)
        assertEquals("风起", book.title)
        assertEquals("某某", book.author)
        assertEquals("private_file", book.sourceType)
        assertEquals(book, persisted)
    }

    private class FakeImportSourceStrategy(
        private val storedBookSource: StoredBookSource,
    ) : ImportSourceStrategy {
        override suspend fun prepare(uri: Uri, mimeType: String?) = storedBookSource
    }

    private class FakeBookMetadataExtractor(
        private val title: String,
        private val author: String?,
        private val format: BookFormat,
    ) : BookMetadataExtractor {
        override suspend fun extract(runtimeUri: Uri, originalUri: Uri, sourceType: String, mimeType: String?) = ImportedBookPayload(
            runtimeUri = runtimeUri,
            originalUri = originalUri,
            title = title,
            author = author,
            format = format,
            sourceType = sourceType,
            mimeType = mimeType,
        )
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/import/ImportFailureUiTest.kt
package io.readio.feature.import

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class ImportFailureUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun shows_reselect_action_for_permission_loss() {
        composeRule.setContent {
            ImportFailureUi(
                model = ImportFailureUiModel(
                    title = "这本书当前无法打开",
                    message = "文件权限已失效，请重新选择原文件",
                    primaryAction = "重新选择原文件",
                    secondaryAction = "返回书架",
                ),
                onPrimary = {},
                onSecondary = {},
            )
        }

        composeRule.onNodeWithText("重新选择原文件").assertIsDisplayed()
        composeRule.onNodeWithText("返回书架").assertIsDisplayed()
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/import/ImportFlowTest.kt
package io.readio.feature.import

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import io.readio.MainActivity
import io.readio.test.ImportTestHarness.triggerSuccessfulEpubImport
import org.junit.Rule
import org.junit.Test

class ImportFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun shows_loading_copy_then_reader_opened_copy_after_successful_import() {
        triggerSuccessfulEpubImport(composeRule, title = "风起")

        composeRule.onNodeWithText("正在导入《风起》...").assertIsDisplayed()
        composeRule.onNodeWithText("已打开《风起》").assertIsDisplayed()
    }
}
```

- [ ] **Step 2: 运行测试，确认 source normalization、导入链路与失败 UI 还是空的**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.feature.import.ImportCoordinatorTest --tests io.readio.runtime.source.BookSourceMaterializerTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.import.ImportFailureUiTest,io.readio.feature.import.ImportFlowTest
```

Expected:
- FAIL，因为 `BookSourceMaterializer`、`StoredBookSource`、`ImportCoordinator`、导入失败 UI、导入 loading/自动开读反馈，以及面向导入的 metadata seam 还不存在。

- [ ] **Step 3: 先实现 source normalization，再实现最小 EPUB 导入链路**

先把 M0 asset-path runtime 改造成可吃导入后 source：

```kotlin
// app/src/main/java/io/readio/runtime/source/StoredBookSource.kt
package io.readio.runtime.source

import android.net.Uri

sealed interface StoredBookSource {
    val originalUri: Uri
    val mimeType: String?

    data class ContentUri(
        override val originalUri: Uri,
        val uri: Uri,
        override val mimeType: String?,
    ) : StoredBookSource

    data class PrivateFile(
        override val originalUri: Uri,
        val filePath: String,
        override val mimeType: String?,
    ) : StoredBookSource
}
```

```kotlin
// app/src/main/java/io/readio/runtime/source/MaterializedBookSource.kt
package io.readio.runtime.source

import android.net.Uri

data class MaterializedBookSource(
    val runtimeUri: Uri,
    val sourceType: String,
)
```

```kotlin
// app/src/main/java/io/readio/runtime/source/BookSourceMaterializer.kt
package io.readio.runtime.source

import android.net.Uri
import java.io.File
import java.io.InputStream

fun interface ContentReader {
    fun open(uri: Uri): InputStream?
}

class BookSourceMaterializer(
    private val filesDir: File,
    private val contentReader: ContentReader,
) {
    constructor(context: android.content.Context) : this(
        filesDir = context.filesDir,
        contentReader = ContentReader { uri -> context.contentResolver.openInputStream(uri) },
    )

    fun materialize(source: StoredBookSource): MaterializedBookSource {
        return when (source) {
            is StoredBookSource.PrivateFile -> MaterializedBookSource(
                runtimeUri = Uri.fromFile(File(source.filePath)),
                sourceType = "private_file",
            )
            is StoredBookSource.ContentUri -> {
                val target = File(filesDir, "books/${System.currentTimeMillis()}.bin")
                target.parentFile?.mkdirs()
                contentReader.open(source.uri)?.use { input ->
                    target.outputStream().use { output -> input.copyTo(output) }
                } ?: error("Cannot open imported source: ${source.uri}")
                MaterializedBookSource(
                    runtimeUri = Uri.fromFile(target),
                    sourceType = "private_file",
                )
            }
        }
    }
}
```

```kotlin
// app/src/main/java/io/readio/feature/epub/EpubEngine.kt
interface EpubEngine {
    suspend fun openPublication(sourceUri: Uri): Publication
    suspend fun toReadiumLocator(sourceUri: Uri, locator: Locator.Textual): org.readium.r2.shared.publication.Locator
}
```

```kotlin
// app/src/main/java/io/readio/feature/epub/ReadiumEpubEngine.kt
class ReadiumEpubEngine(
    context: Context,
    private val appContext: Context = context.applicationContext,
) : EpubEngine {
    override suspend fun openPublication(sourceUri: Uri): Publication = withContext(Dispatchers.IO) {
        val httpClient = DefaultHttpClient()
        val assetRetriever = AssetRetriever(appContext.contentResolver, httpClient)
        val asset = assetRetriever.retrieve(sourceUri).fold(
            { it },
            { error -> throw IllegalStateException("Failed to retrieve EPUB source at $sourceUri: $error") },
        )
        val publicationParser = DefaultPublicationParser(appContext, httpClient, assetRetriever, null)
        val publicationOpener = PublicationOpener(publicationParser, emptyList())
        publicationOpener.open(asset, allowUserInteraction = true).fold(
            { it },
            { error -> throw IllegalStateException("Failed to parse EPUB source at $sourceUri: $error") },
        )
    }

    override suspend fun toReadiumLocator(sourceUri: Uri, locator: Locator.Textual): ReadiumLocator {
        val publication = openPublication(sourceUri)
        // 后续保持原来的 href 查找逻辑
    }
}
```

`PdfDocumentGateway` 同理从 `openAsset(assetPath: String)` 改成 `open(sourceUri: Uri)`，内部直接 `ParcelFileDescriptor` 打开 materialized file URI。

然后再接导入链路：

```kotlin
// app/src/main/java/io/readio/feature/import/ImportedBookPayload.kt
package io.readio.feature.import

import android.net.Uri
import io.readio.core.model.BookFormat

 data class ImportedBookPayload(
    val runtimeUri: Uri,
    val originalUri: Uri,
    val title: String,
    val author: String?,
    val format: BookFormat,
    val sourceType: String,
    val mimeType: String?,
)
```

```kotlin
// app/src/main/java/io/readio/runtime/epub/EpubMetadataExtractor.kt
package io.readio.runtime.epub

import android.content.Context
import android.net.Uri
import io.readio.core.model.BookFormat
import io.readio.feature.import.ImportedBookPayload

class EpubMetadataExtractor(private val context: Context) {
    suspend fun extract(runtimeUri: Uri, originalUri: Uri, sourceType: String, mimeType: String?): ImportedBookPayload {
        return ImportedBookPayload(
            runtimeUri = runtimeUri,
            originalUri = originalUri,
            title = runtimeUri.lastPathSegment ?: "未命名 EPUB",
            author = null,
            format = BookFormat.EPUB,
            sourceType = sourceType,
            mimeType = mimeType,
        )
    }
}
```

```kotlin
// app/src/main/java/io/readio/feature/import/ImportCoordinator.kt
package io.readio.feature.import

import android.net.Uri
import io.readio.core.model.Book
import io.readio.data.repository.LibraryRepository
import io.readio.runtime.epub.EpubMetadataExtractor
import io.readio.runtime.source.BookSourceMaterializer
import java.util.UUID

class ImportCoordinator(
    private val sourceStrategy: ImportSourceStrategy,
    private val materializer: BookSourceMaterializer,
    private val metadataExtractor: BookMetadataExtractor,
    private val persistBook: suspend (Book) -> Unit,
) {
    suspend fun import(uri: Uri, mimeType: String?): Book {
        val storedSource = sourceStrategy.prepare(uri, mimeType)
        val materialized = materializer.materialize(storedSource)
        val payload = metadataExtractor.extract(
            runtimeUri = materialized.runtimeUri,
            originalUri = storedSource.originalUri,
            sourceType = materialized.sourceType,
            mimeType = storedSource.mimeType,
        )
        val book = Book(
            id = UUID.randomUUID().toString(),
            title = payload.title,
            author = payload.author,
            format = payload.format,
            sourceUri = when (storedSource) {
                is StoredBookSource.PrivateFile -> Uri.fromFile(java.io.File(storedSource.filePath))
                is StoredBookSource.ContentUri -> storedSource.uri
            },
            sourceType = when (storedSource) {
                is StoredBookSource.PrivateFile -> "private_file"
                is StoredBookSource.ContentUri -> "content_uri"
            },
            originalUri = payload.originalUri,
            mimeType = payload.mimeType,
            importedAt = System.currentTimeMillis(),
        )
        persistBook(book)
        return book
    }
}
```

这里允许两个很窄的 seam：
- `BookMetadataExtractor`：避免把 Readium/Pdf metadata 解析塞进所有导入单测
- `persistBook: suspend (Book) -> Unit`：避免为了一个导入测试额外引入 repository fake hierarchy
- `ImportLoadingOverlay`：把“导入中”固定成页面级 seam，避免 loading 状态散在按钮和导航副作用里

这些 seam 都只服务当前 TDD，范围收窄到函数边界或单个 composable，不会上升成额外架构层。

同时把失败体验最小落成一个窄 UI seam：
- `ImportFailureUiModel` 负责把失败类型映射成标题、说明、主动作、次动作
- 至少覆盖：格式不支持、权限失效 / 文件不可访问、文件损坏 / 解析失败
- 失败 UI 必须是页面或对话层，不允许退回 toast-only

同时要明确：
- `storedSource` / `Book.sourceUri` / `Book.sourceType` 才是持久化来源，用于后续恢复、重授权、重定位
- `materialized.runtimeUri` 只给运行时打开，不写回长期书籍记录

`LibraryScreen` 在 Task 3 先只暴露 EPUB picker：

```kotlin
arrayOf("application/epub+zip")
```

并把导入结果交给 `LibraryViewModel.importBook(uri, mimeType)`。

导入交互必须按 UI spec 的三段式反馈落地：
- 选中文件后立即进入页面级轻遮罩 loading：`正在导入《书名》...`
- 导入成功后触发一次性导航事件 `OpenReader(bookId)`
- reader 首屏显示一次性轻提示：`已打开《书名》`

关键约束：
- loading 文案必须直接包含本次书名，不能只写通用 `正在导入...`
- `ImportLoadingOverlay` 必须挂在 `LibraryScreen` 顶层或 `ReadioNavHost` 同级产品层，确保 loading 与失败态都可覆盖当前页面
- 导入失败时要退出 loading，并切到 `ImportFailureUi`；不允许出现 loading 悬挂后只弹 toast 的半失败态

这里禁止只让按钮进入 loading 而页面没有任何导入中状态提示；否则用户会感觉像卡死或突然跳页。

`app/src/androidTest/java/io/readio/test/ImportTestHarness.kt` 在 Task 3 创建，统一承载以下测试辅助能力：
- `triggerSuccessfulEpubImport(composeRule, title)`
- `seedLibraryWithEpubBookAndSavedLocator(composeRule, title, spineId, progression)`
- `seedLibraryWithTxtBookAndSavedProgress(composeRule, title, chapterTitle, progression)`
- `seedLibraryWithPdfBookAndSavedProgress(composeRule, title, pageIndex, pageOffset)`
- `triggerRecoverySuccess(composeRule, title)`

不要把这些 helper 隐式散落在各测试文件里；否则计划对执行者不够自解释。

到 Task 6 必须扩成：

```kotlin
arrayOf("application/epub+zip", "text/plain")
```

到 Task 8 再扩成：

```kotlin
arrayOf("application/epub+zip", "text/plain", "application/pdf")
```

不要只把 TXT/PDF 接在外部 intent 上，主书架导入入口也必须同步放开。

- [ ] **Step 4: 重新跑 source normalization 与导入协调器测试**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.feature.import.ImportCoordinatorTest --tests io.readio.runtime.source.BookSourceMaterializerTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.import.ImportFailureUiTest,io.readio.feature.import.ImportFlowTest
```

Expected:
- PASS

- [ ] **Step 5: 在模拟器上手工确认 EPUB 已经能进入书架；并补上“导入成功后自动开读”的导航 contract**

Run:
```bash
./gradlew :app:installDebug
```

Manual check:
- 打开 App
- 点击“导入本地书籍”
- 选择一个 EPUB
- 导入成功后自动进入 reader
- 返回书架后能看到新书

Expected:
- 书名可见
- 导入成功后 reader route 被触发，而不是只静默落书架
- 没有崩溃
- 没有出现空白书架但后台已导入的错态

- [ ] **Step 6: 提交这一小步**

```bash
git add app/src/main/java/io/readio/feature/library/LibraryScreen.kt app/src/main/java/io/readio/feature/library/LibraryUiState.kt app/src/main/java/io/readio/feature/library/LibraryViewModel.kt app/src/main/java/io/readio/feature/library/ImportLoadingOverlay.kt app/src/main/java/io/readio/feature/import/ImportCoordinator.kt app/src/main/java/io/readio/feature/import/ImportSourceStrategy.kt app/src/main/java/io/readio/feature/import/ImportedBookPayload.kt app/src/main/java/io/readio/feature/import/BookMetadataExtractor.kt app/src/main/java/io/readio/feature/import/ImportFailureUiModel.kt app/src/main/java/io/readio/feature/import/ImportFailureUi.kt app/src/main/java/io/readio/runtime/source/StoredBookSource.kt app/src/main/java/io/readio/runtime/source/MaterializedBookSource.kt app/src/main/java/io/readio/runtime/source/BookSourceMaterializer.kt app/src/main/java/io/readio/runtime/epub/EpubMetadataExtractor.kt app/src/main/java/io/readio/feature/epub/EpubEngine.kt app/src/main/java/io/readio/feature/epub/ReadiumEpubEngine.kt app/src/main/java/io/readio/feature/pdf/PdfDocumentGateway.kt app/src/main/java/io/readio/navigation/ReadioNavHost.kt app/src/androidTest/java/io/readio/test/ImportTestHarness.kt app/src/androidTest/java/io/readio/feature/import/ImportFailureUiTest.kt app/src/androidTest/java/io/readio/feature/import/ImportFlowTest.kt app/src/test/java/io/readio/feature/import/ImportCoordinatorTest.kt app/src/test/java/io/readio/runtime/source/BookSourceMaterializerTest.kt

git commit -m "feat: import epub books into the local library"
```

---

### Task 4: 打通 EPUB 开读、导入后自动开读与基础进度保存/恢复

**Files:**
- Create: `app/src/main/java/io/readio/feature/reader/ReaderUiState.kt`
- Create: `app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt`
- Create: `app/src/main/java/io/readio/feature/reader/ReaderScreen.kt`
- Create: `app/src/main/java/io/readio/feature/reader/ReaderChromeState.kt`
- Create: `app/src/main/java/io/readio/runtime/epub/EpubReaderFragment.kt`
- Create: `app/src/main/java/io/readio/runtime/epub/EpubReaderScreen.kt`
- Modify: `app/src/main/java/io/readio/navigation/ReadioDestination.kt`
- Modify: `app/src/main/java/io/readio/navigation/ReadioNavHost.kt`
- Modify: `app/src/main/java/io/readio/data/repository/ReadingProgressRepository.kt`
- Test: `app/src/test/java/io/readio/feature/reader/ReaderChromeStateTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/reader/EpubReaderFlowTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/reader/ReaderAccessibilityContractTest.kt`

- [ ] **Step 1: 先写恢复策略测试，再写“导入后自动开读”和“继续阅读恢复”两个 reader flow failing tests**

```kotlin
// app/src/test/java/io/readio/feature/reader/ProgressRestorePolicyTest.kt
package io.readio.feature.reader

import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import org.junit.Assert.assertEquals
import org.junit.Test

class ProgressRestorePolicyTest {
    @Test
    fun epub_falls_back_to_same_spine_start_when_exact_locator_cannot_be_replayed() {
        val saved = Locator.Textual(
            bookId = "book-1",
            format = BookFormat.EPUB,
            spineId = "OEBPS/chapter2.xhtml",
            progression = 0.42,
            contextSnippet = "第2章 夜路",
        )

        val restored = ProgressRestorePolicy.resolveEpub(
            saved = saved,
            availableSpineIds = listOf("OEBPS/chapter1.xhtml", "OEBPS/chapter2.xhtml"),
            exactReplayAvailable = false,
        )

        assertEquals("OEBPS/chapter2.xhtml", restored.spineId)
        assertEquals(0.0, restored.progression, 0.0)
    }
}
```

```kotlin
// app/src/test/java/io/readio/feature/reader/ReaderChromeStateTest.kt
package io.readio.feature.reader

import org.junit.Assert.assertEquals
import org.junit.Test

class ReaderChromeStateTest {
    @Test
    fun closing_sheet_returns_to_controls_instead_of_immersive() {
        assertEquals(
            ReaderChromeState.ControlsVisible,
            ReaderChromeState.SettingsSheet.opened().closeOverlay()
        )
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/reader/EpubReaderFlowTest.kt
package io.readio.feature.reader

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.readio.MainActivity
import io.readio.test.ImportTestHarness.seedLibraryWithEpubBookAndSavedLocator
import io.readio.test.ImportTestHarness.triggerSuccessfulEpubImport
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EpubReaderFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun opens_reader_immediately_after_successful_epub_import() {
        triggerSuccessfulEpubImport(composeRule, title = "新导入 EPUB")

        composeRule.onNodeWithText("新导入 EPUB").assertIsDisplayed()
        composeRule.onNodeWithText("恢复到 起始位置").assertIsDisplayed()
        composeRule.onNodeWithText("已打开《新导入 EPUB》").assertIsDisplayed()
    }

    @Test
    fun opens_reader_for_seeded_epub_book_and_uses_safe_restart_restore() {
        seedLibraryWithEpubBookAndSavedLocator(
            composeRule = composeRule,
            title = "Readio Spike EPUB",
            spineId = "OEBPS/chapter2.xhtml",
            progression = 0.42,
        )

        composeRule.onNodeWithText("Readio Spike EPUB").assertIsDisplayed()
        composeRule.onNodeWithTag("continue-reading-card").performClick()
        composeRule.onNodeWithText("Readio Spike EPUB").assertIsDisplayed()
        composeRule.onNodeWithText("恢复到 OEBPS/chapter2.xhtml").assertIsDisplayed()
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/reader/ReaderAccessibilityContractTest.kt
package io.readio.feature.reader

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class ReaderAccessibilityContractTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun exposes_explicit_show_controls_entry_when_accessibility_mode_is_on() {
        composeRule.setContent {
            ReaderScreen(
                state = ReaderUiState.Loading,
                chromeState = ReaderChromeState.Immersive,
                accessibilityMode = true,
                onToggleControls = {},
            )
        }

        composeRule.onNodeWithText("显示阅读控制").assertIsDisplayed()
    }
}
```

- [ ] **Step 2: 运行测试，确认恢复策略、导入后自动开读和 continue reading flow 还没接起来**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.feature.reader.ProgressRestorePolicyTest --tests io.readio.feature.reader.ReaderChromeStateTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.reader.EpubReaderFlowTest,io.readio.feature.reader.ReaderAccessibilityContractTest
```

Expected:
- FAIL，因为 `ReaderViewModel`、正式 reader route、导入成功后的导航 contract、Reader 状态机、TalkBack 显式入口，以及把初始 locator 传给 EPUB runtime 的 wiring 还没接上。

- [ ] **Step 3: 做最小 EPUB reader route，只承诺 safe restart 恢复**

`ReaderViewModel` 只先支持一个 `bookId`，但阅读壳状态不要散在多个 composable 本地变量里；先收成一个很小的 `ReaderChromeState`，至少覆盖：
- `Immersive`
- `ControlsVisible`
- `TocOpen`
- `SettingsSheet`
- `RestoreHintVisible`

`ReaderChromeState` 必须满足一个关键约束：关闭目录或设置后回到 `ControlsVisible`，而不是直接跳回 `Immersive`。

`ReaderViewModel` 只先支持一个 `bookId`：

```kotlin
// app/src/main/java/io/readio/feature/reader/ReaderUiState.kt
package io.readio.feature.reader

import io.readio.core.model.Book
import io.readio.core.model.Locator

sealed interface ReaderUiState {
    data object Loading : ReaderUiState
    data class EpubReady(val book: Book, val initialLocator: Locator.Textual?) : ReaderUiState
    data class Error(val message: String) : ReaderUiState
}
```

在 `ReaderViewModel` 里：
- 先取书籍
- 再取保存的 `ReadingProgress`
- 若是 EPUB，则用 `ProgressRestorePolicy.resolveEpub(...)`
- 把结果交给 `EpubReaderScreen`
- 导入成功时发出一次性导航事件 `OpenReader(bookId)`，由 `LibraryScreen` / `ReadioNavHost` 消费并立刻跳进 reader route

Reader route 除了恢复位置，还要补 UI spec 已冻结的最小产品反馈：
- 首次进入时显示一次性提示：`已打开《书名》`
- 若存在恢复位置，显示：`已恢复到上次阅读位置` 或测试可观测版本
- 若恢复降级，显示更明确的降级提示，而不是静默跳走
- TalkBack/屏幕阅读器开启时，`ReaderScreen` 必须暴露显式 `显示阅读控制` 入口，且目录 / 设置关闭后焦点返回触发按钮

为了让 flow test 真能断言，不要把“初始 locator 已传入 reader”藏在不可观测内部状态里；在 debug/test build 下给 `EpubReaderScreen` 暴露一个最小可观测文本或 semantics tag，例如：

```kotlin
Text("恢复到 ${initialLocator?.spineId ?: "起始位置"}")
```

`EpubReaderScreen` 不要复用带证明状态的 `EpubNavigatorHostFragment`；新建只服务于产品阅读的 `EpubReaderFragment`，只承担：
- 打开 publication
- 挂载 navigator
- 接收一个初始 `Locator.Textual`
- 监听当前位置变化并回调给 `ReaderViewModel.saveProgress(locator)`

- [ ] **Step 4: 重新跑恢复策略测试和 EPUB reader flow 测试**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.feature.reader.ProgressRestorePolicyTest --tests io.readio.feature.reader.ReaderChromeStateTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.reader.EpubReaderFlowTest,io.readio.feature.reader.ReaderAccessibilityContractTest
```

Expected:
- PASS

- [ ] **Step 5: 手工确认“导入后自动开读 + 重启后继续读”**

Run:
```bash
./gradlew :app:installDebug
```

Manual check:
- 导入一本 EPUB 后自动进入 reader
- 读到第二章附近后退出 App
- 重启 App 再次打开同一本书
- 能回到第二章的最近可信位置；若精确位置不能重放，至少回到第二章开头

- [ ] **Step 6: 提交这一小步**

```bash
git add app/src/main/java/io/readio/feature/reader/ReaderUiState.kt app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt app/src/main/java/io/readio/feature/reader/ReaderScreen.kt app/src/main/java/io/readio/runtime/epub/EpubReaderFragment.kt app/src/main/java/io/readio/runtime/epub/EpubReaderScreen.kt app/src/main/java/io/readio/navigation/ReadioDestination.kt app/src/main/java/io/readio/navigation/ReadioNavHost.kt app/src/main/java/io/readio/data/repository/ReadingProgressRepository.kt app/src/test/java/io/readio/feature/reader/ProgressRestorePolicyTest.kt app/src/androidTest/java/io/readio/feature/reader/EpubReaderFlowTest.kt

git commit -m "feat: open imported epub books and restore progress"
```

---

### Task 5: 完成书架继续阅读卡、书架列表、目录与基础阅读设置

**Files:**
- Modify: `app/src/main/java/io/readio/feature/library/LibraryScreen.kt`
- Create: `app/src/main/java/io/readio/feature/library/LibraryTopHero.kt`
- Create: `app/src/main/java/io/readio/feature/library/ContinueReadingCard.kt`
- Create: `app/src/main/java/io/readio/feature/library/LibraryBooksGrid.kt`
- Modify: `app/src/main/java/io/readio/feature/library/LibraryViewModel.kt`
- Create: `app/src/main/java/io/readio/feature/settings/SettingsViewModel.kt`
- Modify: `app/src/main/java/io/readio/feature/settings/SettingsScreen.kt`
- Create: `app/src/main/java/io/readio/feature/reader/ReaderControls.kt`
- Create: `app/src/main/java/io/readio/feature/reader/ReaderThemeOption.kt`
- Modify: `app/src/main/java/io/readio/core/model/ReaderSettings.kt`
- Create: `app/src/main/java/io/readio/feature/reader/ReaderSettingsSheet.kt`
- Create: `app/src/main/java/io/readio/feature/reader/TocDrawer.kt`
- Modify: `app/src/main/java/io/readio/data/settings/ReaderSettingsStore.kt`
- Test: `app/src/androidTest/java/io/readio/feature/library/LibraryTopHeroTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/library/ContinueReadingCardTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/library/LibraryBooksGridTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/settings/SettingsScreenTest.kt`
- Test: `app/src/androidTest/java/io/readio/data/settings/ReaderSettingsStoreTest.kt`

- [ ] **Step 1: 先写 continue reading 和设置持久化的 failing tests**

```kotlin
// app/src/androidTest/java/io/readio/feature/library/LibraryTopHeroTest.kt
package io.readio.feature.library

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import io.readio.core.model.ReadingProgress
import org.junit.Rule
import org.junit.Test

class LibraryTopHeroTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun shows_empty_state_when_library_has_no_books() {
        composeRule.setContent {
            LibraryTopHero.Empty(onImportClick = {})
        }

        composeRule.onNodeWithText("把你的书导进来").assertIsDisplayed()
    }

    @Test
    fun shows_first_book_cta_when_books_exist_but_no_progress() {
        composeRule.setContent {
            LibraryTopHero.FirstBook(
                title = "风起",
                onStartReading = {},
            )
        }

        composeRule.onNodeWithText("开始阅读你的第一本书").assertIsDisplayed()
        composeRule.onNodeWithText("开始阅读").assertIsDisplayed()
    }

    @Test
    fun shows_continue_reading_when_valid_progress_exists() {
        composeRule.setContent {
            LibraryTopHero.ContinueReading(
                title = "风起",
                progress = ReadingProgress(
                    bookId = "book-1",
                    locator = Locator.Textual(
                        bookId = "book-1",
                        format = BookFormat.EPUB,
                        spineId = "chapter-2.xhtml",
                        progression = 0.4,
                    ),
                    updatedAt = 1L,
                ),
                onContinue = {},
            )
        }

        composeRule.onNodeWithText("继续阅读").assertIsDisplayed()
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/library/ContinueReadingCardTest.kt
package io.readio.feature.library

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import io.readio.core.model.BookFormat
import io.readio.core.model.Locator
import io.readio.core.model.ReadingProgress
import org.junit.Rule
import org.junit.Test

class ContinueReadingCardTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun shows_book_title_and_resume_hint() {
        composeRule.setContent {
            ContinueReadingCard(
                title = "风起",
                progress = ReadingProgress(
                    bookId = "book-1",
                    locator = Locator.Textual(
                        bookId = "book-1",
                        format = BookFormat.EPUB,
                        spineId = "chapter-2.xhtml",
                        progression = 0.4,
                    ),
                    updatedAt = 1L,
                ),
                onClick = {},
            )
        }

        composeRule.onNodeWithText("继续阅读").assertIsDisplayed()
        composeRule.onNodeWithText("风起").assertIsDisplayed()
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/data/settings/ReaderSettingsStoreTest.kt
package io.readio.data.settings

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.readio.feature.reader.ReaderThemeOption
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReaderSettingsStoreTest {
    @Test
    fun persists_font_scale_theme_and_brightness() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = ReaderSettingsStore(context, fileName = "reader-settings-task5")

        store.update(fontScale = 1.2f, theme = ReaderThemeOption.EyeCare, brightness = 0.8f)
        val settings = store.settings.first()

        assertEquals(1.2f, settings.fontScale)
        assertEquals(ReaderThemeOption.EyeCare, settings.theme)
        assertEquals(0.8f, settings.brightness)
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/library/LibraryBooksGridTest.kt
package io.readio.feature.library

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import io.readio.core.model.Book
import io.readio.core.model.BookFormat
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class LibraryBooksGridTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun shows_all_books_section_and_opens_selected_book() {
        var clickedBookId: String? = null
        composeRule.setContent {
            LibraryBooksGrid(
                books = listOf(
                    Book(
                        id = "book-1",
                        title = "风起",
                        author = "某某",
                        format = BookFormat.EPUB,
                        sourceUri = android.net.Uri.parse("content://books/1"),
                        sourceType = "content_uri",
                        importedAt = 1L,
                    ),
                    Book(
                        id = "book-2",
                        title = "长夜",
                        author = null,
                        format = BookFormat.TXT,
                        sourceUri = android.net.Uri.parse("content://books/2"),
                        sourceType = "content_uri",
                        importedAt = 2L,
                    ),
                ),
                onBookClick = { clickedBookId = it.id },
            )
        }

        composeRule.onNodeWithText("全部书籍").assertIsDisplayed()
        composeRule.onNodeWithText("长夜").performClick()
        assertEquals("book-2", clickedBookId)
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/settings/SettingsScreenTest.kt
package io.readio.feature.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import io.readio.feature.reader.ReaderThemeOption
import org.junit.Rule
import org.junit.Test

class SettingsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun shows_reading_file_and_about_sections() {
        composeRule.setContent {
            SettingsScreen(
                state = SettingsUiState(
                    defaultTheme = ReaderThemeOption.Light,
                    keepScreenOn = true,
                    followSystemDarkMode = false,
                ),
                onThemeChange = {},
                onKeepScreenOnChange = {},
                onFollowSystemDarkModeChange = {},
            )
        }

        composeRule.onNodeWithText("阅读").assertIsDisplayed()
        composeRule.onNodeWithText("导入与文件").assertIsDisplayed()
        composeRule.onNodeWithText("关于").assertIsDisplayed()
        composeRule.onNodeWithText("支持 PDF 基础阅读，可翻页、缩放与继续阅读。", substring = true).assertIsDisplayed()
    }

    @Test
    fun updates_default_theme_from_settings_page() {
        var changedTheme: ReaderThemeOption? = null
        composeRule.setContent {
            SettingsScreen(
                state = SettingsUiState(
                    defaultTheme = ReaderThemeOption.Light,
                    keepScreenOn = true,
                    followSystemDarkMode = false,
                ),
                onThemeChange = { changedTheme = it },
                onKeepScreenOnChange = {},
                onFollowSystemDarkModeChange = {},
            )
        }

        composeRule.onNodeWithText("护眼").performClick()
        org.junit.Assert.assertEquals(ReaderThemeOption.EyeCare, changedTheme)
    }
}
```

- [ ] **Step 2: 运行测试，确认 UI 和 DataStore 还没齐**

Run:
```bash
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.data.settings.ReaderSettingsStoreTest,io.readio.feature.library.LibraryTopHeroTest,io.readio.feature.library.ContinueReadingCardTest,io.readio.feature.library.LibraryBooksGridTest,io.readio.feature.settings.SettingsScreenTest
```

Expected:
- FAIL

- [ ] **Step 3: 落地最小 continue reading + reader controls**

要求：
- `LibraryScreen` 顶部主引导区必须落地为三态，而不是只把 continue reading 卡塞上去
- `ContinueReadingCard` 只在存在有效阅读进度时出现，并带 `continue-reading-card` tag
- 有书但无阅读历史时，顶部改为 `开始阅读你的第一本书` 引导区
- `LibraryBooksGrid` 必须在顶部主引导区下方落地 `全部书籍` 2 列网格；点击任一本书都能进入对应 reader，而不是只能靠 continue reading 卡回流
- `SettingsScreen` 不能继续停留在单个 `Text("设置")` 占位；至少落地三个分组：`阅读`、`导入与文件`、`关于`
- `SettingsScreen` 的 `阅读` 分组至少承载：默认主题、是否保持屏幕常亮、是否跟随系统夜间模式
- `SettingsScreen` 的 `导入与文件` 分组至少承载：文件访问说明、文件失效后重新定位说明
- `SettingsScreen` 的 `关于` 分组至少承载：当前版本范围说明、支持格式说明，并显式展示统一 PDF 文案 `支持 PDF 基础阅读，可翻页、缩放与继续阅读。`
- `ReaderControls` 底栏只保留：目录、进度、设置
- 字号、主题、亮度都收进 `ReaderSettingsSheet`，不要在底栏平铺成独立按钮
- `ReaderThemeOption` 至少覆盖：`Light`、`Dark`、`EyeCare`
- `ReaderSettings` 改成持有 `theme: ReaderThemeOption` 与 `brightness: Float`，不要继续用 `darkTheme: Boolean`
- `TocDrawer` 先只支持 EPUB 目录与 TXT 章节目录，不接 PDF
- `ReaderSettingsSheet` 至少支持 `fontScale`、`lineHeightScale`、`theme`、`brightness`
- `ReaderSettingsStore` 只做 DataStore，不做多层包装
- `SettingsViewModel` 直接从 `ReaderSettingsStore` 暴露 `SettingsUiState`，不要再造多层 facade
- `ReaderControls` / `TocDrawer` / `ReaderSettingsSheet` 要按 UI spec 落最小状态契约：目录与设置打开后不与主控制层显隐打架
- TalkBack 开启时必须有显式 `显示阅读控制` 入口，不能只依赖点击正文

关键代码形状：

```kotlin
// app/src/main/java/io/readio/feature/reader/ReaderThemeOption.kt
package io.readio.feature.reader

enum class ReaderThemeOption {
    Light,
    Dark,
    EyeCare,
}
```

```kotlin
// app/src/main/java/io/readio/core/model/ReaderSettings.kt
package io.readio.core.model

import io.readio.feature.reader.ReaderThemeOption

data class ReaderSettings(
    val fontScale: Float = 1.0f,
    val lineHeightScale: Float = 1.0f,
    val theme: ReaderThemeOption = ReaderThemeOption.Light,
    val brightness: Float = 1.0f,
    val useVerticalScroll: Boolean = true,
)
```

```kotlin
// app/src/main/java/io/readio/feature/library/ContinueReadingCard.kt
@Composable
fun ContinueReadingCard(
    title: String,
    progress: ReadingProgress,
    onClick: () -> Unit,
) {
    ElevatedCard(
        onClick = onClick,
        modifier = Modifier.semantics { testTag = "continue-reading-card" },
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("继续阅读")
            Text(title)
            Text(progress.locator.toString())
        }
    }
}
```

Task 5 同时要把目录抽屉和设置 Sheet 的最小可访问性契约补进去：
- 打开时要有标题可被朗读，例如 `目录`、`阅读设置`
- 关闭方式至少包含显式关闭动作和系统返回键
- 关闭后焦点回到触发按钮
- 模态层打开时，背景正文不继续作为可访问焦点目标


- [ ] **Step 4: 跑绿五个测试**

Run:
```bash
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.data.settings.ReaderSettingsStoreTest,io.readio.feature.library.LibraryTopHeroTest,io.readio.feature.library.ContinueReadingCardTest,io.readio.feature.library.LibraryBooksGridTest,io.readio.feature.settings.SettingsScreenTest
```

Expected:
- PASS

- [ ] **Step 5: 手工确认书架、设置和目录真的可用**

Manual check:
- 书架首屏先显示主引导区，再显示 `全部书籍` 2 列网格
- 点击 continue reading 卡能进入最近一本；点击 `全部书籍` 任一本也能进入对应 reader
- reader 内点击正文可以显示/隐藏控制层
- 目录面板能跳转章节
- 调大字号后退出再进入仍保留
- 深色或护眼主题重进后仍保留
- 设置页能看到 `阅读 / 导入与文件 / 关于` 三组内容，且支持格式说明里出现统一 PDF 文案

- [ ] **Step 6: 提交这一小步**

```bash
git add app/src/main/java/io/readio/feature/library/LibraryScreen.kt app/src/main/java/io/readio/feature/library/LibraryTopHero.kt app/src/main/java/io/readio/feature/library/ContinueReadingCard.kt app/src/main/java/io/readio/feature/library/LibraryBooksGrid.kt app/src/main/java/io/readio/feature/library/LibraryViewModel.kt app/src/main/java/io/readio/feature/settings/SettingsViewModel.kt app/src/main/java/io/readio/feature/settings/SettingsScreen.kt app/src/main/java/io/readio/feature/reader/ReaderControls.kt app/src/main/java/io/readio/feature/reader/ReaderThemeOption.kt app/src/main/java/io/readio/core/model/ReaderSettings.kt app/src/main/java/io/readio/feature/reader/ReaderSettingsSheet.kt app/src/main/java/io/readio/feature/reader/TocDrawer.kt app/src/main/java/io/readio/data/settings/ReaderSettingsStore.kt app/src/androidTest/java/io/readio/feature/library/LibraryTopHeroTest.kt app/src/androidTest/java/io/readio/feature/library/ContinueReadingCardTest.kt app/src/androidTest/java/io/readio/feature/library/LibraryBooksGridTest.kt app/src/androidTest/java/io/readio/feature/settings/SettingsScreenTest.kt app/src/androidTest/java/io/readio/data/settings/ReaderSettingsStoreTest.kt

git commit -m "feat: add bookshelf browsing and reading settings surfaces"
```

---

### Task 6: 接入 TXT 导入与统一文本阅读链路

**Files:**
- Modify: `app/src/main/java/io/readio/feature/import/ImportCoordinator.kt`
- Create: `app/src/main/java/io/readio/runtime/txt/TxtMetadataExtractor.kt`
- Create: `app/src/main/java/io/readio/runtime/txt/TxtReaderDocument.kt`
- Create: `app/src/main/java/io/readio/runtime/txt/TxtReaderScreen.kt`
- Modify: `app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt`
- Modify: `app/src/main/java/io/readio/feature/reader/ReaderUiState.kt`
- Test: `app/src/test/java/io/readio/runtime/txt/TxtReaderDocumentTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/reader/TxtReaderFlowTest.kt`

- [ ] **Step 1: 先写 TXT 文档模型和恢复的 failing tests**

```kotlin
// app/src/test/java/io/readio/runtime/txt/TxtReaderDocumentTest.kt
package io.readio.runtime.txt

import org.junit.Assert.assertEquals
import org.junit.Test

class TxtReaderDocumentTest {
    @Test
    fun falls_back_to_single_linear_chapter_when_parser_finds_no_heading() {
        val document = TxtReaderDocument.fromRawText("连续正文，没有章节。")
        assertEquals(1, document.chapters.size)
        assertEquals("全文", document.chapters.first().title)
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/reader/TxtReaderFlowTest.kt
package io.readio.feature.reader

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.readio.MainActivity
import io.readio.test.ImportTestHarness.seedLibraryWithTxtBookAndSavedProgress
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TxtReaderFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun opens_txt_book_and_restores_linear_or_chapter_progress() {
        seedLibraryWithTxtBookAndSavedProgress(
            composeRule = composeRule,
            title = "长夜",
            chapterTitle = "全文",
            progression = 0.6,
        )

        composeRule.onNodeWithText("长夜").assertIsDisplayed()
        composeRule.onNodeWithTag("continue-reading-card").performClick()
        composeRule.onNodeWithText("长夜").assertIsDisplayed()
        composeRule.onNodeWithText("恢复到 全文 / 0.6").assertIsDisplayed()
    }
}
```

- [ ] **Step 2: 运行测试，确认 TXT 产品链路还没接进来**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.runtime.txt.TxtReaderDocumentTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.reader.TxtReaderFlowTest
```

Expected:
- FAIL

- [ ] **Step 3: 最小接入 TXT，不额外发明第二套 reader 壳**

要求：
- `ImportCoordinator` 根据 mime / 扩展名分流 EPUB 与 TXT
- TXT 继续沿用 Task 3 已建立的 source normalization，不再另造第二套导入源模型
- Task 6 把主书架 picker 扩成 `arrayOf("application/epub+zip", "text/plain")`
- `TxtMetadataExtractor` 先只抽文件名作为标题
- `TxtReaderDocument.fromRawText()` 内部复用现有 `TxtChapterParser.parse(raw)`
- `TxtReaderScreen` 只做滚动文本阅读
- 和 EPUB 一样，给 flow test 留一个最小可观测恢复标记，例如 `Text("恢复到 ${chapterTitle} / ${progression}")`
- 如果章节识别失败，必须降级到 `全文`，而不是报错阻塞导入

关键代码形状：

```kotlin
// app/src/main/java/io/readio/runtime/txt/TxtReaderDocument.kt
package io.readio.runtime.txt

import io.readio.feature.txt.TxtChapter
import io.readio.feature.txt.TxtChapterParser

data class TxtReaderDocument(val chapters: List<TxtChapter>) {
    companion object {
        fun fromRawText(raw: String): TxtReaderDocument {
            return TxtReaderDocument(TxtChapterParser.parse(raw))
        }
    }
}
```

- [ ] **Step 4: 跑绿 TXT 文档与 reader flow 测试**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.runtime.txt.TxtReaderDocumentTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.reader.TxtReaderFlowTest
```

Expected:
- PASS

- [ ] **Step 5: 手工确认两类 TXT 都可读**

Manual check:
- 导入带章节标题的 TXT：目录可见
- 导入无章节标题的 TXT：显示“全文”，仍可继续阅读

- [ ] **Step 6: 提交这一小步**

```bash
git add app/src/main/java/io/readio/feature/import/ImportCoordinator.kt app/src/main/java/io/readio/runtime/txt/TxtMetadataExtractor.kt app/src/main/java/io/readio/runtime/txt/TxtReaderDocument.kt app/src/main/java/io/readio/runtime/txt/TxtReaderScreen.kt app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt app/src/main/java/io/readio/feature/reader/ReaderUiState.kt app/src/test/java/io/readio/runtime/txt/TxtReaderDocumentTest.kt app/src/androidTest/java/io/readio/feature/reader/TxtReaderFlowTest.kt

git commit -m "feat: add txt reading path"
```

---

### Task 7: 加入系统分享/打开方式导入与源失效恢复流

**Files:**
- Modify: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/io/readio/feature/import/IncomingBookIntentHandler.kt`
- Create: `app/src/main/java/io/readio/feature/import/SourceRecoveryResolver.kt`
- Modify: `app/src/main/java/io/readio/feature/library/LibraryViewModel.kt`
- Modify: `app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt`
- Modify: `app/src/main/java/io/readio/feature/library/LibraryScreen.kt`
- Test: `app/src/androidTest/java/io/readio/feature/import/IncomingBookIntentHandlerTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/import/SourceRecoveryFlowTest.kt`
- Test: `app/src/test/java/io/readio/feature/import/SourceRecoveryResolverTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/import/RecoverySuccessFeedbackTest.kt`

- [ ] **Step 1: 先写分享导入和恢复策略的 failing tests**

```kotlin
// app/src/test/java/io/readio/feature/import/SourceRecoveryResolverTest.kt
package io.readio.feature.import

import io.readio.core.model.ImportFailure
import org.junit.Assert.assertEquals
import org.junit.Test

class SourceRecoveryResolverTest {
    @Test
    fun maps_security_exception_to_reauthorize_action() {
        val result = SourceRecoveryResolver.resolve(SecurityException("denied"))
        assertEquals(ImportFailure.ReauthorizeSource::class, result::class)
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/import/IncomingBookIntentHandlerTest.kt
package io.readio.feature.import

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class IncomingBookIntentHandlerTest {
    @Test
    fun reads_view_intent_uri_as_import_request() {
        val uri = Uri.parse("content://books/share.epub")
        val request = IncomingBookIntentHandler.parse(
            Intent(Intent.ACTION_VIEW).setData(uri).setType("application/epub+zip")
        )

        assertEquals(uri, request?.uri)
    }

    @Test
    fun reads_send_intent_stream_as_import_request() {
        val uri = Uri.parse("content://books/shared.txt")
        val request = IncomingBookIntentHandler.parse(
            Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_STREAM, uri)
        )

        assertEquals(uri, request?.uri)
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/import/RecoverySuccessFeedbackTest.kt
package io.readio.feature.import

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import io.readio.MainActivity
import io.readio.test.ImportTestHarness.triggerRecoverySuccess
import org.junit.Rule
import org.junit.Test

class RecoverySuccessFeedbackTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun shows_success_feedback_after_relinking_source() {
        triggerRecoverySuccess(composeRule, title = "风起")

        composeRule.onNodeWithText("已重新连接《风起》").assertIsDisplayed()
        composeRule.onNodeWithText("已恢复到上次阅读位置").assertIsDisplayed()
    }
}
```

- [ ] **Step 2: 运行测试，确认异常恢复和外部入口都还没落地**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.feature.import.SourceRecoveryResolverTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.import.IncomingBookIntentHandlerTest,io.readio.feature.import.RecoverySuccessFeedbackTest
```

Expected:
- FAIL

- [ ] **Step 3: 只实现 M1 需要的恢复动作，不做复杂状态机**

`AndroidManifest.xml` 分开声明 `ACTION_VIEW` / `ACTION_SEND` 导入入口。

Task 7 这里只接入 EPUB / TXT 的外部系统导入；`application/pdf` 不能在这里提前暴露，因为 PDF 正式产品链路要到 Task 8 才补齐。Task 7 的恢复流必须对齐 UI spec 的两类恢复动作：
- 可直接重试型 -> `重试`
- 必须重新定位型 -> `重新选择原文件`

恢复成功后必须给确认闭环，例如：`已重新连接《书名》`、`已恢复到上次阅读位置`，不能只悄悄成功。

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:mimeType="application/epub+zip" />
    <data android:mimeType="text/plain" />
</intent-filter>

<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="application/epub+zip" />
    <data android:mimeType="text/plain" />
</intent-filter>
```

`IncomingBookIntentHandler.parse(intent)` 必须同时处理：
- `ACTION_VIEW` -> `intent.data`
- `ACTION_SEND` -> `intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)`

恢复策略只处理三类：
- `SecurityException` -> `ReauthorizeSource`
- `FileNotFoundException` -> `RelocateSource`
- 其他 `IllegalStateException` -> `ReimportBook`

不要搞通用事件总线。

- [ ] **Step 4: 重新跑分享导入与恢复策略测试**

Run:
```bash
./gradlew :app:testDebugUnitTest --tests io.readio.feature.import.SourceRecoveryResolverTest
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.import.IncomingBookIntentHandlerTest,io.readio.feature.import.RecoverySuccessFeedbackTest
```

Expected:
- PASS

- [ ] **Step 5: 手工确认两条恢复链路**

Manual check:
- 通过系统“打开方式”把一本 EPUB/TXT 发给 Readio，能进入书架或直接进入对应 reader
- 把已导入书的源文件移动或撤销权限后再次打开，UI 能给出“重新授权”或“重新选择文件”的明确动作
- 恢复后尽量保留书籍记录与阅读进度

- [ ] **Step 6: 提交这一小步**

```bash
git add app/src/main/AndroidManifest.xml app/src/main/java/io/readio/feature/import/IncomingBookIntentHandler.kt app/src/main/java/io/readio/feature/import/SourceRecoveryResolver.kt app/src/main/java/io/readio/feature/library/LibraryViewModel.kt app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt app/src/main/java/io/readio/feature/library/LibraryScreen.kt app/src/androidTest/java/io/readio/feature/import/IncomingBookIntentHandlerTest.kt app/src/test/java/io/readio/feature/import/SourceRecoveryResolverTest.kt

git commit -m "feat: add import recovery and external entrypoints"
```

---

### Task 8: 补上 PDF bounded compatibility path

**Files:**
- Modify: `app/src/main/java/io/readio/feature/import/ImportCoordinator.kt`
- Modify: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/io/readio/feature/pdf/PdfCapabilityCopy.kt`
- Modify: `app/src/main/java/io/readio/feature/settings/SettingsScreen.kt`
- Modify: `app/src/main/java/io/readio/feature/library/LibraryScreen.kt`
- Create: `app/src/main/java/io/readio/runtime/pdf/PdfMetadataExtractor.kt`
- Create: `app/src/main/java/io/readio/runtime/pdf/PdfReaderScreen.kt`
- Modify: `app/src/main/java/io/readio/feature/reader/ReaderUiState.kt`
- Modify: `app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt`
- Test: `app/src/androidTest/java/io/readio/feature/reader/PdfReaderFlowTest.kt`
- Test: `app/src/androidTest/java/io/readio/feature/pdf/PdfCapabilityCopyTest.kt`

- [ ] **Step 1: 先写 PDF compatibility 的 failing test**

```kotlin
// app/src/androidTest/java/io/readio/feature/reader/PdfReaderFlowTest.kt
package io.readio.feature.reader

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.readio.MainActivity
import io.readio.feature.pdf.PdfCapabilityCopy
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PdfReaderFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun opens_pdf_and_restores_last_page_index() {
        seedLibraryWithPdfBookAndSavedProgress(
            title = "合同附件",
            pageIndex = 8,
            pageOffset = 0.2f,
        )

        composeRule.onNodeWithText("合同附件").assertIsDisplayed()
        composeRule.onNodeWithTag("continue-reading-card").performClick()
        composeRule.onNodeWithText("PDF Reader").assertIsDisplayed()
        composeRule.onNodeWithText("恢复到第 8 页").assertIsDisplayed()
        composeRule.onNodeWithText(PdfCapabilityCopy.Primary).assertIsDisplayed()
    }
}
```

```kotlin
// app/src/androidTest/java/io/readio/feature/pdf/PdfCapabilityCopyTest.kt
package io.readio.feature.pdf

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import io.readio.feature.library.LibraryScreen
import io.readio.feature.settings.SettingsScreen
import io.readio.feature.settings.SettingsUiState
import io.readio.feature.reader.ReaderThemeOption
import io.readio.runtime.pdf.PdfReaderScreen
import org.junit.Rule
import org.junit.Test

class PdfCapabilityCopyTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun reuses_the_same_pdf_copy_in_library_settings_and_first_pdf_open_hint() {
        composeRule.setContent {
            androidx.compose.foundation.layout.Column {
                LibraryScreen(onImportClick = {})
                SettingsScreen(
                    state = SettingsUiState(
                        defaultTheme = ReaderThemeOption.Light,
                        keepScreenOn = true,
                        followSystemDarkMode = false,
                    ),
                    onThemeChange = {},
                    onKeepScreenOnChange = {},
                    onFollowSystemDarkModeChange = {},
                )
                PdfReaderScreen(initialLocator = null, showCapabilityHint = true)
            }
        }

        composeRule.onAllNodesWithText(PdfCapabilityCopy.Primary).assertCountEquals(3)
    }
}
```

- [ ] **Step 2: 运行测试，确认 PDF 还没进入正式产品链路**

Run:
```bash
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.reader.PdfReaderFlowTest,io.readio.feature.pdf.PdfCapabilityCopyTest
```

Expected:
- FAIL

- [ ] **Step 3: 只实现 PDF 最小承诺，不扩写功能面**

要求：
- `ImportCoordinator` 能识别 PDF
- PDF 同样继续沿用 Task 3 已建立的 source normalization
- Task 8 才把主书架 picker 扩成 `arrayOf("application/epub+zip", "text/plain", "application/pdf")`
- Task 8 也要把 `AndroidManifest.xml` 的外部 `ACTION_VIEW` / `ACTION_SEND` MIME 声明补上 `application/pdf`，这样 PDF 外部导入能力与正式 reader 落在同一任务闭环里
- `PdfMetadataExtractor` 只抽标题、页数、首屏尺寸
- `PdfReaderScreen` 只做：打开、翻页/滚动、缩放、记录最后 `pageIndex + pageOffset`
- flow test 至少断言恢复页码；手工验收必须补看缩放是否可用
- 给 flow test 留一个最小可观测恢复标记，例如 `Text("恢复到第 ${pageIndex} 页")`
- `SettingsScreen` 的支持格式说明、`LibraryScreen` 空状态说明、首次打开 PDF 的轻提示，这三处面对用户的文案必须统一为：`支持 PDF 基础阅读，可翻页、缩放与继续阅读。`
- 不做 TOC、不做标注、不做 evidence、不做 reflow

核心形状：

```kotlin
// app/src/main/java/io/readio/runtime/pdf/PdfReaderScreen.kt
package io.readio.runtime.pdf

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import io.readio.core.model.Locator

@Composable
fun PdfReaderScreen(initialLocator: Locator.Pdf?) {
    Text("PDF Reader")
}
```

- [ ] **Step 4: 跑绿 PDF reader flow 和文案一致性测试**

Run:
```bash
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.reader.PdfReaderFlowTest,io.readio.feature.pdf.PdfCapabilityCopyTest
```

Expected:
- PASS

- [ ] **Step 5: 手工确认 PDF 兼容路径真的够用**

Manual check:
- 导入 PDF 后可打开
- 翻到第 N 页退出
- 再打开能回到最近合法页
- 首次打开 PDF 时能看到统一提示文案 `支持 PDF 基础阅读，可翻页、缩放与继续阅读。`
- 设置页支持格式说明与书架空状态说明使用相同文案
- UI 不承诺 EPUB/TXT 级别目录与设置

- [ ] **Step 6: 提交这一小步**

```bash
git add app/src/main/java/io/readio/feature/import/ImportCoordinator.kt app/src/main/AndroidManifest.xml app/src/main/java/io/readio/feature/pdf/PdfCapabilityCopy.kt app/src/main/java/io/readio/feature/settings/SettingsScreen.kt app/src/main/java/io/readio/feature/library/LibraryScreen.kt app/src/main/java/io/readio/runtime/pdf/PdfMetadataExtractor.kt app/src/main/java/io/readio/runtime/pdf/PdfReaderScreen.kt app/src/main/java/io/readio/feature/reader/ReaderUiState.kt app/src/main/java/io/readio/feature/reader/ReaderViewModel.kt app/src/androidTest/java/io/readio/feature/reader/PdfReaderFlowTest.kt app/src/androidTest/java/io/readio/feature/pdf/PdfCapabilityCopyTest.kt

git commit -m "feat: add bounded pdf compatibility"
```

---

### Task 9: 替换掉 M0 spike 入口，跑完整体验验收并更新交接

**Files:**
- Modify: `app/src/main/java/io/readio/MainActivity.kt`
- Delete or stop referencing: `app/src/main/java/io/readio/navigation/SpikeDestination.kt`
- Delete or stop referencing: `app/src/main/java/io/readio/navigation/SpikeNavHost.kt`
- Delete or stop referencing: `app/src/main/java/io/readio/feature/home/SpikeHomeScreen.kt`
- Delete or stop referencing: `app/src/main/java/io/readio/feature/epub/EpubSpikeScreen.kt`
- Delete or stop referencing: `app/src/main/java/io/readio/feature/txt/TxtSpikeScreen.kt`
- Delete or stop referencing: `app/src/main/java/io/readio/feature/pdf/PdfSpikeScreen.kt`
- Delete or replace: `app/src/androidTest/java/io/readio/SpikeHomeScreenTest.kt`
- Delete or replace: `app/src/androidTest/java/io/readio/feature/epub/EpubSpikeScreenTest.kt`
- Create: `app/src/androidTest/java/io/readio/feature/library/M1SmokeTest.kt`
- Modify: `HANDOFF.md`

- [ ] **Step 1: 先写 M1 smoke test，确保删 spike 入口前有替代证明**

```kotlin
// app/src/androidTest/java/io/readio/feature/library/M1SmokeTest.kt
package io.readio.feature.library

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertCountEquals
import io.readio.MainActivity
import org.junit.Rule
import org.junit.Test

class M1SmokeTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun shows_bookshelf_as_primary_entrypoint() {
        composeRule.onNodeWithText("书架").assertIsDisplayed()
        composeRule.onNodeWithText("导入本地书籍").assertIsDisplayed()
        composeRule.onAllNodesWithText("EPUB Spike").assertCountEquals(0)
    }
}
```

- [ ] **Step 2: 运行 smoke test，确认现在还没真正摆脱 spike 痕迹**

Run:
```bash
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.library.M1SmokeTest
```

Expected:
- FAIL 或至少在清理前不稳定。

- [ ] **Step 3: 删除或停用所有只服务于 M0 UI 入口的文件**

执行原则：
- 保留 `ReadiumEpubEngine`、`TxtChapterParser`、`PdfDocumentGateway`、运行时测试与 ADR 文档
- 删除只服务于 spike 菜单和 spike UI 的入口文件
- 不要顺手重构运行时底座

- [ ] **Step 4: 跑完整自动化验证**

Run:
```bash
./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest
```

中间按单个 instrumented case 验证时，一律使用：

```bash
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=<fully.qualified.TestClass>
```

Expected:
- 全部 PASS
- 没有任何测试还依赖 `SpikeNavHost` 或 `SpikeHomeScreen`

- [ ] **Step 5: 跑最终人工验收清单**

Manual checklist:
- 首次安装后 3 分钟内能导入并开始阅读 EPUB
- 能导入 TXT 并继续阅读
- PDF 能打开并恢复页码
- “继续阅读”始终优先于“管理书籍”
- 阅读器单击正文显示/隐藏控制层
- 字号/主题设置持久化
- 源文件失效/权限失效时给出明确恢复动作
- 没有任何 AI / 搜书入口出现在 M1 正式产品壳中

- [ ] **Step 6: 更新 `HANDOFF.md`**

`HANDOFF.md` 必须至少写清：
- 当前目标：M1 本地阅读闭环已达成到哪一步
- 已验证路径：EPUB/TXT/PDF 各自结果
- 保留边界：EPUB 仍是 safe restart，不是 exact restore；PDF 仍是 bounded compatibility
- 未完成项：若有非关键收尾项后置，必须明确写出；但 route lock 已冻结的 EPUB/TXT/PDF 主链路和外部 intent 恢复链路不得静默降级出 M1
- 下一步：M1 收尾、灰度体验、或 M2 前置准备

- [ ] **Step 7: 提交最终收口**

```bash
git add HANDOFF.md app/src/androidTest/java/io/readio/feature/library/M1SmokeTest.kt app/src/main/java/io/readio/MainActivity.kt app/src/main/java/io/readio/navigation/ReadioNavHost.kt app/src/main/java/io/readio/navigation/ReadioDestination.kt

git rm app/src/main/java/io/readio/navigation/SpikeDestination.kt app/src/main/java/io/readio/navigation/SpikeNavHost.kt app/src/main/java/io/readio/feature/home/SpikeHomeScreen.kt app/src/main/java/io/readio/feature/epub/EpubSpikeScreen.kt app/src/main/java/io/readio/feature/txt/TxtSpikeScreen.kt app/src/main/java/io/readio/feature/pdf/PdfSpikeScreen.kt app/src/androidTest/java/io/readio/SpikeHomeScreenTest.kt app/src/androidTest/java/io/readio/feature/epub/EpubSpikeScreenTest.kt

git commit -m "feat: complete M1 local reading loop shell"
```

---

## Final Verification

M1 收口前必须执行：

```bash
./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest
```

Expected:
- unit tests PASS
- connected tests PASS
- 没有遗留对 `SpikeNavHost` / `SpikeHomeScreen` 的依赖
- EPUB/TXT/PDF 三条路径都至少有 1 个产品级 flow test
- 导入三段式反馈、恢复成功闭环、以及 TalkBack 显式控制入口都有自动化覆盖

然后做一次完整人工 walkthrough：

1. 冷启动 -> 书架空状态 -> 导入 EPUB -> 自动开读
2. 退出 App -> 重进 -> 继续阅读
3. 导入带章节 TXT -> 阅读 -> 继续阅读
4. 导入无章节 TXT -> “全文”降级 -> 继续阅读
5. 导入 PDF -> 翻页 -> 重进恢复页码
6. 调整字号/主题 -> 重进验证持久化
7. 撤销源权限或移动源文件 -> 验证恢复 CTA 与恢复成功确认文案
8. 开启 TalkBack 或模拟无障碍模式 -> 验证 `显示阅读控制` 入口始终可达

若任一项失败，M1 不能算闭环完成。

---

## M1 Exit Gate

只有同时满足以下条件，才算 M1 达标：

- [ ] 书架是正式首页，且“继续阅读”优先展示
- [ ] EPUB 从导入到继续阅读全链路稳定可用
- [ ] TXT 从导入到继续阅读全链路稳定可用，解析失败时能降级为“全文”
- [ ] PDF 具备 route lock 已冻结的 bounded compatibility path：可导入、可打开、可翻页/缩放、可记录并恢复页码
- [ ] 阅读设置最小集持久化：字号、行距、三态主题、亮度
- [ ] 位置恢复语义符合本计划，不夸大到 exact restore
- [ ] 源文件/权限失效时，给出明确恢复路径与恢复成功确认闭环
- [ ] PDF 用户文案在书架空态 / 设置说明 / PDF 首开提示上保持一致
- [ ] M2/M3 能力未混入 M1 正式壳层

---

## Handoff to Execution

执行这份计划时，严格按顺序做：

1. **Task 1 ~ Task 4 先把 EPUB 主路径做通**
2. **Task 5 做 continue reading + 设置**
3. **Task 6 接 TXT**
4. **Task 7 接恢复流与外部导入**
5. **Task 8 最后补 PDF compatibility**
6. **Task 9 才做 spike UI 清理与最终收口**

不要把 PDF、外部分享导入、以及 spike 清理提前到 EPUB/TXT 主链路之前。
