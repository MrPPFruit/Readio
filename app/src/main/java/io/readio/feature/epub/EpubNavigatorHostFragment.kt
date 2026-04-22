package io.readio.feature.epub

import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentContainerView
import androidx.lifecycle.lifecycleScope
import io.readio.core.model.BookFormat
import io.readio.core.model.EvidenceAnchor
import io.readio.core.model.Locator
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.readium.r2.navigator.HyperlinkNavigator
import org.readium.r2.navigator.epub.EpubDefaults
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.util.AbsoluteUrl
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.data.ReadError
import java.util.concurrent.atomic.AtomicReference
import org.readium.r2.shared.publication.Locator as ReadiumLocator

class EpubNavigatorHostFragment : Fragment(), EpubNavigatorFragment.Listener {

    enum class Stage {
        OPENED_PUBLICATION,
        NAVIGATOR_ATTACHED,
        JUMP_REQUESTED,
        LANDED_ON_TARGET,
        RETURN_REQUESTED,
        RETURNED_TO_PRE_JUMP,
    }

    companion object {
        private const val ARG_ASSET_PATH = "asset_path"
        private const val ARG_SPINE_ID = "spine_id"
        private const val ARG_PROGRESSION = "progression"
        private const val ARG_CONTEXT_SNIPPET = "context_snippet"
        private const val NAVIGATOR_TAG = "epub_navigator"
        private const val NAVIGATOR_CONTAINER_ID = 0x52454144
        private const val STATE_STAGE = "state_stage"
        private const val STATE_HAS_REQUESTED_RETURN = "state_has_requested_return"
        private const val STATE_FIRST_HREF = "state_first_href"
        private const val STATE_SECOND_HREF = "state_second_href"

        fun newInstance(
            assetPath: String,
            spineId: String,
            progression: Double,
            contextSnippet: String?,
        ): EpubNavigatorHostFragment = EpubNavigatorHostFragment().apply {
            arguments = Bundle().apply {
                putString(ARG_ASSET_PATH, assetPath)
                putString(ARG_SPINE_ID, spineId)
                putDouble(ARG_PROGRESSION, progression)
                putString(ARG_CONTEXT_SNIPPET, contextSnippet)
            }
        }
    }

    private lateinit var engine: ReadiumEpubEngine
    private lateinit var assetPath: String
    private lateinit var requestedSpineId: String
    private var requestedProgression: Double = 0.0
    private var requestedContextSnippet: String? = null

    private var publication: Publication? = null
    private var navigatorFragment: EpubNavigatorFragment? = null
    private var hasRequestedReturn = false

    private var firstHref: String? = null
    private var secondHref: String? = null

    private val _latestReadiumLocator = MutableStateFlow<ReadiumLocator?>(null)
    private val _latestSharedLocator = MutableStateFlow<Locator.Textual?>(null)
    private val _lastJumpReadiumLocator = MutableStateFlow<ReadiumLocator?>(null)
    private val _preJumpReadiumLocator = MutableStateFlow<ReadiumLocator?>(null)
    private val _returnedReadiumLocator = MutableStateFlow<ReadiumLocator?>(null)

    val latestReadiumLocator: ReadiumLocator? get() = _latestReadiumLocator.value
    val latestSharedLocator: Locator.Textual? get() = _latestSharedLocator.value
    val lastJumpReadiumLocator: ReadiumLocator? get() = _lastJumpReadiumLocator.value
    val preJumpReadiumLocator: ReadiumLocator? get() = _preJumpReadiumLocator.value
    val returnedReadiumLocator: ReadiumLocator? get() = _returnedReadiumLocator.value
    val evidenceAnchor: EvidenceAnchor? get() = _evidenceAnchor.value

    val latestReadiumLocatorFlow: StateFlow<ReadiumLocator?> = _latestReadiumLocator.asStateFlow()
    val latestSharedLocatorFlow: StateFlow<Locator.Textual?> = _latestSharedLocator.asStateFlow()
    val lastJumpReadiumLocatorFlow: StateFlow<ReadiumLocator?> = _lastJumpReadiumLocator.asStateFlow()
    val preJumpReadiumLocatorFlow: StateFlow<ReadiumLocator?> = _preJumpReadiumLocator.asStateFlow()
    val returnedReadiumLocatorFlow: StateFlow<ReadiumLocator?> = _returnedReadiumLocator.asStateFlow()

    private val _evidenceAnchor = MutableStateFlow<EvidenceAnchor?>(null)
    private val stageRef = AtomicReference<Stage?>(null)
    private val sequenceComplete = CompletableDeferred<Unit>()
    private val locatorMapper = ReadiumLocatorMapper()
    private var containerId: Int = View.NO_ID
    private var initialNavigatorLocator: ReadiumLocator? = null

    override fun onAttach(context: Context) {
        super.onAttach(context)
        engine = ReadiumEpubEngine(context)
        loadArguments()
        prepareNavigatorSession()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installNavigatorFactory()
        super.onCreate(savedInstanceState)
        restoreHostState(savedInstanceState)
    }

    override fun onCreateView(
        inflater: android.view.LayoutInflater,
        container: android.view.ViewGroup?,
        savedInstanceState: Bundle?,
    ): View {
        val context = requireContext()
        containerId = NAVIGATOR_CONTAINER_ID
        return FragmentContainerView(context).apply {
            id = containerId
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        installNavigatorFactory()
        val existingNavigator = childFragmentManager.findFragmentByTag(NAVIGATOR_TAG) as? EpubNavigatorFragment
        viewLifecycleOwner.lifecycleScope.launch {
            if (existingNavigator == null) {
                openAndAttachNavigator()
            } else {
                restartNavigatorSequence(existingNavigator)
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(STATE_STAGE, stageRef.get()?.name)
        outState.putBoolean(STATE_HAS_REQUESTED_RETURN, hasRequestedReturn)
        outState.putString(STATE_FIRST_HREF, firstHref)
        outState.putString(STATE_SECOND_HREF, secondHref)
    }

    override fun onDestroy() {
        publication?.close()
        publication = null
        navigatorFragment = null
        super.onDestroy()
    }

    suspend fun awaitNavigatorSequenceAsync(timeoutMs: Long) {
        try {
            withTimeout(timeoutMs) { sequenceComplete.await() }
        } catch (_: TimeoutCancellationException) {
            val unfinished = stageRef.get()?.name ?: "NOT_STARTED"
            throw IllegalStateException("Navigator sequence timed out at stage $unfinished")
        }
    }

    fun awaitNavigatorSequence(timeoutMs: Long) {
        runBlocking {
            awaitNavigatorSequenceAsync(timeoutMs)
        }
    }

    override fun onJumpToLocator(locator: ReadiumLocator) {
        when (stageRef.get()) {
            Stage.RETURN_REQUESTED,
            Stage.RETURNED_TO_PRE_JUMP,
            -> Unit
            else -> _lastJumpReadiumLocator.value = locator
        }
    }

    override fun onResourceLoadFailed(href: Url, error: ReadError) {
        if (!sequenceComplete.isCompleted) {
            sequenceComplete.completeExceptionally(IllegalStateException("Failed to load $href: $error"))
        }
    }

    override fun shouldFollowInternalLink(link: Link, context: HyperlinkNavigator.LinkContext?): Boolean = true

    override fun onExternalLinkActivated(url: AbsoluteUrl) = Unit

    private suspend fun openAndAttachNavigator() {
        if (childFragmentManager.isStateSaved) return

        prepareNavigatorSession()
        val anchor = _evidenceAnchor.value ?: throw IllegalStateException("Evidence anchor missing")
        val fragmentManager = childFragmentManager
        installNavigatorFactory()
        if (fragmentManager.isStateSaved) {
            publication?.close()
            publication = null
            return
        }
        fragmentManager.beginTransaction()
            .replace(containerId, EpubNavigatorFragment::class.java, Bundle(), NAVIGATOR_TAG)
            .commitNow()

        navigatorFragment = fragmentManager.findFragmentByTag(NAVIGATOR_TAG) as? EpubNavigatorFragment
            ?: throw IllegalStateException("Navigator fragment missing after attach")
        stageRef.set(Stage.NAVIGATOR_ATTACHED)
        observeNavigator()
        stageRef.set(Stage.JUMP_REQUESTED)
        navigatorFragment?.go(engine.toReadiumLocator(anchor.locator as Locator.Textual), false)
    }

    private fun observeNavigator() {
        val navigator = navigatorFragment ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            navigator.currentLocator.collect { locator ->
                updateLatest(locator)
                when {
                    stageRef.get() == Stage.JUMP_REQUESTED && locator.href.toString() == secondHref -> {
                        _lastJumpReadiumLocator.value = locator
                        stageRef.set(Stage.LANDED_ON_TARGET)
                        val preJump = _preJumpReadiumLocator.value
                        if (!hasRequestedReturn && preJump != null && preJump.href != _lastJumpReadiumLocator.value?.href) {
                            hasRequestedReturn = true
                            stageRef.set(Stage.RETURN_REQUESTED)
                            navigator.go(preJump, false)
                        }
                    }

                    stageRef.get() == Stage.RETURN_REQUESTED && locator.href.toString() == firstHref -> {
                        _returnedReadiumLocator.value = locator
                        stageRef.set(Stage.RETURNED_TO_PRE_JUMP)
                        if (!sequenceComplete.isCompleted) {
                            sequenceComplete.complete(Unit)
                        }
                    }

                    stageRef.get() == Stage.RETURNED_TO_PRE_JUMP && locator.href.toString() == firstHref -> {
                        _returnedReadiumLocator.value = locator
                        if (!sequenceComplete.isCompleted) {
                            sequenceComplete.complete(Unit)
                        }
                    }
                }
            }
        }
    }

    private suspend fun restartNavigatorSequence(existingNavigator: EpubNavigatorFragment) {
        navigatorFragment = existingNavigator
        observeNavigator()
        _lastJumpReadiumLocator.value = null
        _returnedReadiumLocator.value = null
        hasRequestedReturn = false
        stageRef.set(Stage.JUMP_REQUESTED)
        val anchor = _evidenceAnchor.value ?: throw IllegalStateException("Evidence anchor missing")
        existingNavigator.go(engine.toReadiumLocator(anchor.locator as Locator.Textual), false)
    }

    private fun loadArguments() {
        assetPath = requireArguments().getString(ARG_ASSET_PATH) ?: error("Missing asset path")
        requestedSpineId = requireArguments().getString(ARG_SPINE_ID) ?: error("Missing spine id")
        requestedProgression = requireArguments().getDouble(ARG_PROGRESSION)
        requestedContextSnippet = requireArguments().getString(ARG_CONTEXT_SNIPPET)
    }

    private fun prepareNavigatorSession() {
        if (publication != null && initialNavigatorLocator != null && _evidenceAnchor.value != null) {
            return
        }

        val openedPublication = runBlocking { engine.openPublication(assetPath) }
        publication = openedPublication
        stageRef.compareAndSet(null, Stage.OPENED_PUBLICATION)

        val readingOrder = openedPublication.readingOrder
        val initialLink = readingOrder.firstOrNull()
            ?: throw IllegalStateException("Publication has no reading order")
        val targetLink = readingOrder.firstOrNull { it.href.toString() == requestedSpineId }
            ?: throw IllegalStateException("Publication cannot resolve requested href $requestedSpineId")

        firstHref = initialLink.href.toString()
        secondHref = targetLink.href.toString()

        val initialLocator = buildReadiumLocator(
            href = firstHref!!,
            link = initialLink,
            progression = 0.0,
            text = requestedContextSnippet,
        )
        initialNavigatorLocator = initialLocator
        _preJumpReadiumLocator.value = _preJumpReadiumLocator.value ?: initialLocator
        if (_latestReadiumLocator.value == null) {
            updateLatest(initialLocator)
        }
        if (_evidenceAnchor.value == null) {
            _evidenceAnchor.value = buildEvidenceAnchor(targetLink)
        }
    }

    private fun installNavigatorFactory() {
        val openedPublication = publication ?: return
        val initialLocator = initialNavigatorLocator ?: return
        childFragmentManager.fragmentFactory = EpubNavigatorFactory(
            publication = openedPublication,
            configuration = EpubNavigatorFactory.Configuration(defaults = EpubDefaults()),
        ).createFragmentFactory(
            initialLocator = initialLocator,
            listener = this,
            configuration = EpubNavigatorFragment.Configuration(),
        )
    }

    private fun restoreHostState(savedInstanceState: Bundle?) {
        if (savedInstanceState == null) return
        savedInstanceState.getString(STATE_STAGE)
            ?.let(Stage::valueOf)
            ?.let(stageRef::set)
        hasRequestedReturn = savedInstanceState.getBoolean(STATE_HAS_REQUESTED_RETURN, false)
        firstHref = savedInstanceState.getString(STATE_FIRST_HREF)
        secondHref = savedInstanceState.getString(STATE_SECOND_HREF)
    }

    private fun updateLatest(locator: ReadiumLocator) {
        _latestReadiumLocator.value = locator
        _latestSharedLocator.value = locatorMapper.map(
            ReadiumLocatorSnapshot(
                bookId = assetPath,
                href = locator.href.toString(),
                progression = locator.locations.progression ?: 0.0,
                text = locator.text.highlight ?: locator.text.after ?: requestedContextSnippet,
            ),
        )
    }

    private fun buildEvidenceAnchor(targetLink: Link): EvidenceAnchor {
        val title = targetLink.title ?: targetLink.href.toString()
        return EvidenceAnchor(
            quote = "quote:${targetLink.href}",
            locator = Locator.Textual(
                bookId = assetPath,
                format = BookFormat.EPUB,
                spineId = requestedSpineId,
                progression = requestedProgression,
                contextSnippet = requestedContextSnippet ?: title,
            ),
            chapterTitle = requestedContextSnippet ?: title,
            createdAt = 1L,
            fallbackAnchor = "${requestedSpineId}#fallback",
        )
    }

    private fun buildReadiumLocator(
        href: String,
        link: Link,
        progression: Double,
        text: String?,
    ): ReadiumLocator = ReadiumLocator(
        href = Url(href) ?: throw IllegalStateException("Invalid href $href"),
        mediaType = link.mediaType ?: throw IllegalStateException("Missing media type for ${link.href}"),
        title = link.title,
        locations = ReadiumLocator.Locations(progression = progression),
        text = ReadiumLocator.Text(after = text),
    )
}
