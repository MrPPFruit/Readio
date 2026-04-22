package io.readio.feature.epub

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import io.readio.R
import io.readio.core.model.Locator
import kotlinx.coroutines.launch

data class EpubNavigatorProbeResult(
    val landedLocator: String,
    val preJumpLocator: String,
    val returnedLocator: String,
    val sameHref: Boolean,
    val returnedToPreJumpHref: Boolean,
)

class EpubNavigatorHostActivity : FragmentActivity() {

    companion object {
        private const val EXTRA_ASSET_PATH = "asset_path"
        private const val EXTRA_SPINE_ID = "spine_id"
        private const val EXTRA_PROGRESSION = "progression"
        private const val EXTRA_CONTEXT_SNIPPET = "context_snippet"
        private const val FRAGMENT_TAG = "epub_navigator_host"
        private const val EXTRA_PROBE_MODE = "probe_mode"
        private const val EXTRA_RESULT_LANDED_LOCATOR = "result_landed_locator"
        private const val EXTRA_RESULT_PRE_JUMP_LOCATOR = "result_pre_jump_locator"
        private const val EXTRA_RESULT_RETURNED_LOCATOR = "result_returned_locator"
        private const val EXTRA_RESULT_SAME_HREF = "result_same_href"
        private const val EXTRA_RESULT_RETURNED_TO_PRE_JUMP_HREF = "result_returned_to_pre_jump_href"

        fun intent(context: Context, assetPath: String, locator: Locator.Textual): Intent =
            Intent(context, EpubNavigatorHostActivity::class.java).apply {
                putExtra(EXTRA_ASSET_PATH, assetPath)
                putExtra(EXTRA_SPINE_ID, locator.spineId)
                putExtra(EXTRA_PROGRESSION, locator.progression)
                putExtra(EXTRA_CONTEXT_SNIPPET, locator.contextSnippet)
            }

        fun probeIntent(context: Context, assetPath: String, locator: Locator.Textual): Intent =
            intent(context, assetPath, locator).putExtra(EXTRA_PROBE_MODE, true)

        fun parseProbeResult(data: Intent?): EpubNavigatorProbeResult? {
            val landedLocator = data?.getStringExtra(EXTRA_RESULT_LANDED_LOCATOR) ?: return null
            val preJumpLocator = data.getStringExtra(EXTRA_RESULT_PRE_JUMP_LOCATOR) ?: return null
            val returnedLocator = data.getStringExtra(EXTRA_RESULT_RETURNED_LOCATOR) ?: return null
            return EpubNavigatorProbeResult(
                landedLocator = landedLocator,
                preJumpLocator = preJumpLocator,
                returnedLocator = returnedLocator,
                sameHref = data.getBooleanExtra(EXTRA_RESULT_SAME_HREF, false),
                returnedToPreJumpHref = data.getBooleanExtra(EXTRA_RESULT_RETURNED_TO_PRE_JUMP_HREF, false),
            )
        }
    }

    val fragment: EpubNavigatorHostFragment
        get() = supportFragmentManager.findFragmentByTag(FRAGMENT_TAG) as? EpubNavigatorHostFragment
            ?: throw IllegalStateException("Navigator host fragment not attached")

    val latestReadiumLocator get() = fragment.latestReadiumLocator
    val latestSharedLocator get() = fragment.latestSharedLocator
    val lastJumpReadiumLocator get() = fragment.lastJumpReadiumLocator
    val preJumpReadiumLocator get() = fragment.preJumpReadiumLocator
    val returnedReadiumLocator get() = fragment.returnedReadiumLocator

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_epub_navigator_host)

        if (savedInstanceState == null && !supportFragmentManager.isStateSaved) {
            val launchIntent = intent
            val assetPath = requireNotNull(launchIntent.getStringExtra(EXTRA_ASSET_PATH))
            val spineId = requireNotNull(launchIntent.getStringExtra(EXTRA_SPINE_ID))
            val progression = launchIntent.getDoubleExtra(EXTRA_PROGRESSION, 0.0)
            val contextSnippet = launchIntent.getStringExtra(EXTRA_CONTEXT_SNIPPET)

            supportFragmentManager.beginTransaction()
                .replace(
                    R.id.navigator_container,
                    EpubNavigatorHostFragment.newInstance(assetPath, spineId, progression, contextSnippet),
                    FRAGMENT_TAG,
                )
                .commitNow()
        }

        if (intent.getBooleanExtra(EXTRA_PROBE_MODE, false)) {
            lifecycleScope.launch {
                finishProbeRun()
            }
        }
    }

    suspend fun awaitNavigatorSequenceAsync(timeoutMs: Long) {
        fragment.awaitNavigatorSequenceAsync(timeoutMs)
    }

    fun awaitNavigatorSequence(timeoutMs: Long) {
        fragment.awaitNavigatorSequence(timeoutMs)
    }

    private suspend fun finishProbeRun() {
        try {
            awaitNavigatorSequenceAsync(timeoutMs = 10_000)
            val landedLocator = requireNotNull(lastJumpReadiumLocator?.toString())
            val preJumpLocator = requireNotNull(preJumpReadiumLocator?.toString())
            val returnedLocator = requireNotNull(returnedReadiumLocator?.toString())
            val targetHref = ((fragment.evidenceAnchor?.locator) as? Locator.Textual)?.spineId
            val actualTargetHref = lastJumpReadiumLocator?.href?.toString()
            val initialHref = preJumpReadiumLocator?.href?.toString()
            val returnedHref = returnedReadiumLocator?.href?.toString()

            setResult(
                RESULT_OK,
                Intent().apply {
                    putExtra(EXTRA_RESULT_LANDED_LOCATOR, landedLocator)
                    putExtra(EXTRA_RESULT_PRE_JUMP_LOCATOR, preJumpLocator)
                    putExtra(EXTRA_RESULT_RETURNED_LOCATOR, returnedLocator)
                    putExtra(EXTRA_RESULT_SAME_HREF, targetHref != null && targetHref == actualTargetHref)
                    putExtra(
                        EXTRA_RESULT_RETURNED_TO_PRE_JUMP_HREF,
                        initialHref != null && initialHref == returnedHref,
                    )
                },
            )
        } catch (_: IllegalStateException) {
            setResult(RESULT_CANCELED)
        } finally {
            finish()
        }
    }
}
