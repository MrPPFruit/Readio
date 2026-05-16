# Readio AI Retrieval and Answer Quality Roadmap

## 1. Why this document exists

Readio already has a reader-native AI assistant: users can ask about selected text or open the assistant from the reader controls. The next improvement target is not simply “make the model smarter”. The more important product goal is:

> Help the AI find the right book content, avoid missing important information, and answer with clear source evidence.

This document records the research findings, product principles, and phased development plan for improving Readio’s retrieval-augmented AI assistant.

It is written for both product and engineering follow-up. Some sections explain technical ideas in plain language first, then describe the engineering direction.

## 2. Current baseline

Current Reader AI direction:

- The assistant lives inside the reader, not as a generic chat page.
- Entry points are:
  - selected text toolbar AI action;
  - quiet floating AI button near reader controls.
- The first state is a bottom ask sheet.
- The answer state is a reader overlay/panel with follow-up input.
- Spoiler protection is visible and defaults to enabled.
- Answers should be based on current reading context and avoid future content unless spoiler protection is disabled.
- Current default indexing strategy can be BM25-only for MVP.
- Embedding remains optional/deferred until we prove it improves quality enough to justify size, cost, and latency.

Important existing project rules:

- Reader AI should stay reader-native.
- UI must use Readio theme tokens.
- RAG work should prioritize citation-first answers and spoiler-safe retrieval boundaries.

## 3. Research summary

### 3.1 HeavySkill: why “deep thinking” matters

Paper: [HeavySkill: Heavy Thinking as the Inner Skill in Agentic Harness](https://arxiv.org/abs/2605.02396)

This paper is not primarily about RAG or ebook search. Its useful idea is a reasoning pattern:

```text
parallel reasoning -> summarization / deliberation
```

Plain-language explanation:

- Instead of asking one model to answer immediately, generate several independent attempts.
- Then ask a final judge/synthesizer to compare them, find mistakes, recover minority-but-important findings, and produce the final answer.
- The final step is not just “summarize”; it is closer to “review, compare, repair, and decide”.

How this applies to Readio:

```text
parallel reading / retrieval -> evidence synthesis -> cited answer
```

For a complex reading question, Readio should not rely on one top-k search result. It can run several different evidence-finding paths, such as:

- exact keyword search;
- semantic search if available;
- current chapter search;
- character/entity search;
- caveat/contrast search for words like “however”, “but”, “except”, “therefore”;
- source-boundary search to avoid spoilers.

Then a synthesis step compares the evidence and writes the answer with citations.

Main product lesson:

> Better answers come from structured evidence diversity before generation, not just a stronger final prompt.

### 3.2 RAPTOR: tree-shaped retrieval for long books

Paper: [RAPTOR](https://arxiv.org/abs/2401.18059)

Plain-language explanation:

A book is not a bag of paragraphs. It has structure: chapters, sections, scenes, arguments, and summaries. RAPTOR builds a tree over the document, where lower nodes are detailed chunks and higher nodes are summaries of related chunks.

Engineering implication for Readio:

Readio should move from flat chunk search toward book-structure-aware retrieval:

```text
book
  -> chapter
    -> section
      -> paragraph
        -> sentence / quote
```

Use detailed chunks for exact evidence, but use parent sections/chapters for context.

### 3.3 LongRAG and hierarchical retrieval: small chunks plus parent context

Relevant papers:

- [LongRAG](https://arxiv.org/abs/2406.15319)
- [LongRAG dual-perspective](https://arxiv.org/abs/2410.18050)
- [Hierarchical Re-ranker Retriever](https://arxiv.org/abs/2503.02401)
- [Hierarchical Document Refinement](https://arxiv.org/abs/2505.10413)

Plain-language explanation:

Small chunks are good for finding exact lines, but they often lose the surrounding meaning. Large chunks keep context, but they are harder to search precisely.

The best pattern is:

```text
small chunk for matching
parent section for understanding
exact paragraph/sentence for citation
```

Engineering implication for Readio:

When a paragraph matches a query, Readio should often expand to include nearby paragraphs or the containing section. But citations should still point to the precise paragraph or location.

### 3.4 RankRAG and reranking: search results need a second look

Paper: [RankRAG](https://arxiv.org/abs/2407.02485)

Plain-language explanation:

The first search result is not always the best evidence. Search can find many “somewhat related” passages. A second ranking step decides which passages are truly useful for answering the question.

Engineering implication for Readio:

A lightweight reranking step should sit between retrieval and answer generation.

Initial implementation does not need a heavy model. We can start with rule-based reranking:

- prefer current chapter or current reading area;
- prefer exact character/name/term matches;
- prefer passages near selected text;
- prefer title/table-of-contents matches;
- down-rank duplicate or very short low-information chunks;
- preserve caveat/definition/conclusion passages;
- filter content beyond the spoiler boundary.

### 3.5 Question decomposition: complex questions need multiple searches

Paper: [Question Decomposition for RAG](https://arxiv.org/abs/2507.00355)

Plain-language explanation:

A user question often hides several smaller questions. If Readio searches only once, it may answer one part but miss another.

Example:

```text
User: Why did this character change their mind, and was it foreshadowed earlier?
```

This should become:

```text
1. Where did the character change their mind?
2. What direct reason is given?
3. Where did earlier related hints appear?
4. Is there enough evidence to connect them?
```

Engineering implication for Readio:

Use question decomposition for:

- comparison questions;
- cause-and-effect questions;
- character relationship questions;
- theme analysis;
- summary requests;
- “don’t miss details” or “全面/详细” requests.

### 3.6 Ground every sentence: citation is not decoration

Paper: [Ground Every Sentence](https://arxiv.org/abs/2407.01796)

Plain-language explanation:

An answer can look credible even when some sentences are unsupported. Good RAG should make factual claims traceable to source passages.

Engineering implication for Readio:

Readio’s citation UI is already in the right direction. Next improvements should aim for:

- citations on key factual claims;
- stable citation order;
- citation jump to exact book location;
- clear behavior when evidence is insufficient;
- no invented source numbers.

### 3.7 RAGChecker and sufficient context: diagnose the failure layer

Relevant papers:

- [RAGChecker](https://arxiv.org/abs/2408.08067)
- [Sufficient Context](https://arxiv.org/abs/2411.06037)
- [Groundedness in Retrieval-augmented Long-form Generation](https://arxiv.org/abs/2404.07060)

Plain-language explanation:

When the AI gives a weak answer, there are several possible causes:

1. The right passage was never retrieved.
2. The passage was retrieved but not included in final context.
3. The passage was included but the model ignored it.
4. The model used it but answered incompletely.
5. The answer cited a passage that does not actually support the claim.
6. The question cannot be answered from the available book content.

Engineering implication for Readio:

We need diagnostic tests, not just “the answer feels good”. Tests should check evidence recall, answer completeness, spoiler safety, and citation support separately.

## 4. Product references

### 4.1 NotebookLM

Public sources:

- [NotebookLM Help](https://support.google.com/notebooklm/answer/16164461)
- [Use chat in NotebookLM](https://support.google.com/notebooklm/answer/16179559)
- [Add or discover sources](https://support.google.com/notebooklm/answer/16215270)
- [NotebookLM Discover Sources](https://blog.google/technology/google-labs/notebooklm-discover-sources/)

Useful product lessons:

- Strong source-grounded positioning.
- Inline citations are a trust mechanism, not a visual extra.
- Source scope matters: users need to know what the AI is allowed to use.
- The product expands beyond chat into study guides, mind maps, and audio overviews.

What public docs do not reveal:

- exact chunking strategy;
- embedding model;
- vector database;
- reranker design;
- citation alignment algorithm;
- retrieval quality evaluation.

Readio implication:

Use NotebookLM as a product-quality reference, not an engineering blueprint. The most important lesson is to make source grounding and citation behavior obvious to the user.

### 4.2 Knowly

Public sources:

- [Knowly](https://goknowly.ai/)
- [Knowly Pricing](https://goknowly.ai/price)
- [Knowly Terms](https://goknowly.ai/terms-of-services)

Useful product lessons:

- Save content first, then help users understand it.
- Auto-organize saved material.
- Generate digests, flows, and learning pages.
- Turn a library into an active learning system.

What public docs do not reveal:

- whether answers are strictly source-grounded;
- citation design;
- retrieval pipeline;
- missing-information prevention;
- quality benchmarks.

Readio implication:

Knowly is more useful as a future product-layer reference: library organization, reading flows, digests, and cross-source learning paths. For core answer trust, NotebookLM is the more relevant reference.

## 5. Important design boundaries

These are not absolute rules. They are discussion triggers. If a proposed design touches these boundaries, we should discuss the trade-off before choosing it.

### 5.1 Generated data size

Target preference:

> Default generated AI cache should usually stay near or below about 3x the source ebook size.

Example:

- Source book: 1 MB.
- Generated cache: about 3 MB or less is preferred for the default path.

If a design may exceed this, discuss:

- What quality improvement do we expect?
- Is this default or optional?
- Can we clean it per book?
- Can we generate it only on demand?
- Can we use a smaller representation?

Why it matters:

- Mobile storage is limited.
- Large caches are harder to explain to users.
- Rebuildable AI cache should not feel like permanent user data.
- Embeddings can grow quickly depending on dimension and chunk count.

### 5.2 Default response time

Target preference:

> Default answers should aim to produce useful output in about 5-10 seconds where practical.

Longer streaming can be acceptable if the user sees progress quickly.

If a design makes the default path materially slower, discuss:

- Is the quality gain worth it?
- Can we stream earlier?
- Can this become an explicit deep-analysis mode instead of default?
- Can we cache only lightweight data?

### 5.3 Deep analysis mode

A slower mode is acceptable if it is user-facing and explicit.

Possible names:

- 深度解析
- 认真查一下
- 全面回答
- Heavy Read
- 不漏细节模式

This mode may allow:

- more retrieval passes;
- question decomposition;
- coverage checks;
- longer answer planning;
- optional temporary evidence cache;
- longer streaming.

But if it requires much larger persistent cache, the storage trade-off should be discussed.

## 6. Recommended development roadmap

## Phase A: Lightweight RAG v2

### Goal

Improve answer reliability without a large storage or latency increase.

### Plain-language explanation

Before adding expensive AI features, make the existing search smarter. The app should know where each passage came from, how it fits into the book, and how to pack the best evidence into the prompt.

### Main work

1. Add richer chunk metadata:
   - book hash;
   - section index;
   - chapter title;
   - href / CFI;
   - sort index;
   - paragraph index if available;
   - start/end text offset if available;
   - parent section id.

2. Improve spoiler boundary:
   - move away from page-number-only filtering;
   - use section/text offset/CFI when possible;
   - crop chunks that cross the last visible boundary.

3. Improve context packing:
   - remove duplicates;
   - preserve book order;
   - keep citation ids stable;
   - prefer current location when relevant;
   - include enough parent context without flooding the model.

4. Add lightweight reranking:
   - current section boost;
   - selected-text proximity boost;
   - exact entity/name match boost;
   - title/TOC match boost;
   - caveat/definition/conclusion signal boost;
   - duplicate/noisy chunk penalty.

### Why this comes first

It directly improves the current implementation while staying compatible with BM25-only default retrieval. It avoids prematurely committing to heavy embedding storage.

### Success criteria

- Selected-text questions include the selected text and useful surrounding context.
- “前面发生了什么” answers prioritize already-read content.
- Citations remain stable and jump to the right source.
- Spoiler-safe filtering is more accurate than page-number estimates.
- Default answer path still feels responsive.

## Phase B: Question intent and source-scope routing

### Goal

Stop treating every question as the same retrieval problem, while making spoiler behavior consistent across every question type.

### Plain-language explanation

There are two separate decisions:

```text
intent = what the user wants help with
scope = how much of the book the AI is allowed to use
```

For example, “这个人是谁？” is always a character/entity question. Spoiler protection should not turn it into a different question type. Instead, spoiler protection changes the answer range:

- spoiler protection on: answer from what the reader has reached so far;
- spoiler protection off: whole-book evidence is allowed, but the answer should say when it is using whole-book information.

In plain terms:

> The question type decides where to look first. The spoiler setting decides how far the assistant is allowed to look.

### Question intents

Initial rule-based intents:

1. `selection_explanation`: explain selected text or the current sentence/paragraph.
2. `current_recap`: recap what has happened up to the current reading position.
3. `entity_lookup`: explain a character, place, organization, item, or concept.
4. `chapter_summary`: summarize the current chapter or section.
5. `analysis`: explain cause/effect, foreshadowing, clue significance, themes, or relationships.
6. `general`: fallback for ordinary source-grounded questions.

Do not model “spoiler-risk” as a normal intent. Spoiler control is a source-scope rule that applies to every intent.

### Source scopes

Initial scopes:

1. `read_so_far`: spoiler protection is enabled; retrieve and answer only from content at or before the current reading boundary.
2. `whole_book_allowed`: spoiler protection is disabled; retrieval may use the whole book, but the answer should make the evidence range clear.

Important nuance:

`whole_book_allowed` means the assistant may use the whole book. It does not mean every answer must over-explain the ending.

Examples:

- “这个人是谁？” + `read_so_far`: “截至你当前读到的位置，他是……”
- “这个人是谁？” + `whole_book_allowed`: “从全书范围看，他后来……”
- “这句话是什么意思？” + `whole_book_allowed`: first explain the local context; only mention later meaning if it materially changes interpretation.
- “总结本章” + `whole_book_allowed`: summarize the chapter, not the whole book, unless the user asks for whole-book context.

### Current implementation status

Implemented and verified locally:

- deterministic intent/scope classifier;
- prompt guidance for intent and source scope;
- browser API reader-context validation for classification metadata;
- Tauri reader chat prompt metadata wiring.

Still pending:

- retrieval strategy changes based on `intent + scope`.

### Main work

1. Add a small intent/scope classifier:
   - rule-based first;
   - LLM-based only if needed later;
   - keep it pure and easy to test.

2. Map each intent plus scope to retrieval strategy:
   - selected text: selected passage + neighbor window, constrained by scope;
   - current recap: current and previous content, constrained by scope;
   - entity lookup: exact name recall, first relevant appearance, recent/current mention, with whole-book expansion only when scope allows;
   - chapter summary: current chapter/section coverage;
   - analysis: broader multi-section retrieval and later query decomposition;
   - general: current retrieval path with scope-aware boundaries.

3. Adjust prompt style by intent and scope:
   - concise local explanation;
   - known-so-far recap;
   - whole-book label when later content is used;
   - evidence list for analysis;
   - uncertainty note when retrieved evidence is insufficient.

### Success criteria

- Spoiler protection behavior is consistent for every question type.
- Turning spoiler protection off allows whole-book evidence without forcing irrelevant ending spoilers into local questions.
- Character/entity questions can answer either “known so far” or “whole-book view” depending on scope.
- Tests cover the same intent under both `read_so_far` and `whole_book_allowed` scopes.
- Prompt/context metadata makes the chosen scope clear to the model.

## Phase C: Deep analysis / Heavy Read mode

### Goal

Offer a slower, higher-quality mode for questions where missing important information is the main risk.

### Plain-language explanation

For normal questions, users want speed. For serious questions, users may prefer a slower answer that checks more of the book. Heavy Read is that slower mode.

### When to use

User explicitly asks for:

- detailed analysis;
- comprehensive answer;
- “不要漏重要信息”;
- character relationship analysis;
- foreshadowing;
- theme tracking;
- cross-chapter comparison;
- study/research style answer.

### Main work

1. Query decomposition:
   - break complex question into sub-questions.

2. Parallel evidence retrieval:
   - BM25 exact path;
   - current section path;
   - entity path;
   - caveat/contrast path;
   - semantic path if available;
   - prior-context path under spoiler protection.

3. Evidence cache:
   - store temporary structured evidence, not raw hidden reasoning.

Example evidence cache format:

```text
pass name:
query variant:
retrieved sections:
key quotes:
claim extracted:
confidence:
possible omission:
contradictions:
```

4. Synthesis / verification:
   - compare retrieved evidence;
   - identify missing coverage;
   - remove unsupported claims;
   - produce final answer with citations.

5. UI state:
   - show that deep analysis is slower;
   - stream progress if possible;
   - allow cancel.

### Storage guidance

Prefer temporary evidence cache for Heavy Read. Avoid large persistent generated data unless the user approves the trade-off.

### Success criteria

- Deep mode gives more complete answers than default mode on complex questions.
- It shows better citation coverage.
- It handles minority-but-important evidence better.
- It does not make normal questions slower.

## Phase D: Optional semantic embedding / high-quality index

### Goal

Test whether embeddings are worth the storage, generation time, and complexity.

### Plain-language explanation

BM25 is good at exact words and names. Embeddings are better when the user asks in different words than the book uses. But embeddings can be large and slow to generate, so they should be proven before becoming default.

### Good embedding use cases

- paraphrased clues;
- character relationships across chapters;
- theme search;
- long-range recap;
- conceptual nonfiction questions.

### Risks

- larger cache size;
- slower first-time indexing;
- API/model dependency;
- possible poor behavior on rare names or Chinese fantasy terms;
- harder user explanation.

### Main work

1. Build evaluation set comparing BM25-only vs embedding-enhanced search.
2. Estimate generated cache size before enabling.
3. Keep embedding optional until quality gain is clear.
4. Provide per-book cleanup.
5. Discuss if expected persistent data may exceed the preferred size boundary.

### Success criteria

- Embedding improves specific test categories that BM25 struggles with.
- Storage and indexing cost are explainable.
- Users can disable or clear the generated cache.

## Phase E: Library-level organization and learning flows

### Goal

Move beyond single-book chat toward a smarter reading library.

### Plain-language explanation

This is the Knowly/NotebookLM-inspired product layer. Once source-grounded answers are reliable, Readio can help users organize and learn from their library.

### Possible features

- automatic topic grouping;
- reading flows;
- chapter maps;
- character maps;
- concept maps;
- study cards;
- weekly reading digest;
- “saved but unread” summaries;
- cross-book comparisons;
- external source discovery with clear labels.

### Source-scope rule

Always distinguish:

- current book;
- already-read part;
- whole book;
- user library;
- external discovered source.

### Why this comes later

If source-grounded retrieval is weak, library-level summaries will look impressive but may hide omissions. Trustworthy retrieval should come first.

## 7. Evaluation plan

Build a small but stable RAG test set before major changes.

### NotebookLM comparison notes

A live NotebookLM comparison was run against the `Readio` notebook containing `《诡秘之主》精校版全本[完美排版].epub`.

Important caveat:

- NotebookLM is useful as a full-book answer quality reference.
- It is not a strict spoiler-safe baseline by default, because it has access to the whole source and may also continue prior conversation context.
- When the prompt explicitly states the reading boundary, NotebookLM can produce a strong bounded answer. This confirms that Readio's key advantage should be enforcing source scope before generation, not merely asking the model to avoid spoilers.

Observed comparison cases:

1. Character lookup: `克莱恩是谁？`
   - Unbounded NotebookLM answer used whole-book/current-history context and mentioned later identity/location details such as `夏洛克·莫里亚蒂` and `贝克兰德`.
   - Bounded prompt avoided those later details and gave a concise known-so-far identity answer.
   - Readio should keep enforcing read-so-far retrieval boundaries for spoiler protection, because prompt-only protection is not reliable enough.

2. Tarot Club membership: `塔罗会当前成员有哪些？`
   - Unbounded NotebookLM answered with later full-book membership.
   - Bounded prompt correctly answered the five-person state at `第二部 第五十一章 五人聚会`: `愚者`、`正义`、`倒吊人`、`太阳`、`世界`.
   - This is a good regression benchmark for entity/list questions under spoiler protection.

3. Current chapter summary: `这章目前讲了什么？`
   - NotebookLM gave a high-quality chapter summary when it knew the boundary.
   - Readio should prioritize current-section/chapter coverage for this intent instead of relying only on global top-k retrieval.

Practical evaluation rule:

> Use NotebookLM to discover what a good answer might include, then convert the comparison into deterministic Readio benchmarks: expected evidence, forbidden future terms, answer completeness checks, and citation support checks.

### Initial standard benchmark candidates

| Case                                                     | Reading boundary             | Expected answer traits                                                                                                      | Forbidden under spoiler protection                              |
| -------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `克莱恩是谁？请按当前阅读进度简短回答并给出依据。`       | Tinggen / early progress     | Zhou Mingrui transmigrated into Klein Moretti; lives in Tingen; joined the Nighthawks / Divination path if already reached. | `夏洛克·莫里亚蒂`, `贝克兰德`, later identities.                |
| `塔罗会当前成员有哪些？请简短列出并给出依据。`           | `第二部 第五十一章 五人聚会` | `愚者`, `正义`, `倒吊人`, `太阳`, `世界`; explain `世界` is Klein's puppet/sockpuppet identity.                             | Later members such as `魔术师`, `月亮`, `隐者`, `星星`, `审判`. |
| `这章目前讲了什么？请按当前阅读进度概括，不要剧透后文。` | current chapter              | Focus on current chapter events and immediate setup; cite chapter-local passages.                                           | Later plot outcomes or future member additions.                 |

### Test categories

1. Single-paragraph factual QA.
2. Selected-text explanation.
3. Current page / current section question.
4. Current chapter summary.
5. Previous recap.
6. Character lookup.
7. Cross-chapter relationship.
8. Theme / foreshadowing.
9. Unanswerable question.
10. Spoiler-risk question.
11. Citation correctness.
12. Answer completeness.

### Diagnostic questions per test

For every test, ask:

1. Was the required evidence retrieved?
2. Was the evidence included in the final context?
3. Did the model use the evidence?
4. Did the answer cover all important points?
5. Are citations correct?
6. Did the answer avoid spoilers?
7. Did the answer admit insufficient evidence when needed?

### Recommended first benchmark size

Start with 30-50 cases. Do not overbuild. The purpose is to catch regressions and compare approaches.

## 8. Recommended priority order

Current status after the latest Reader AI work:

- Phase A is partially implemented: richer chunk metadata, improved Chinese BM25, source-boundary filtering, safer citations, and volume-aware chapter labels are in place.
- Phase B is in progress: intent/scope routing exists, spoiler protection is now treated as a maximum evidence scope rather than a question type, `chapter_summary` questions prioritize current-section summary chunks, and entity/list questions mix in current-section context.
- The next best step is not embeddings yet. The NotebookLM comparison points to better intent-specific retrieval coverage as the highest-return improvement.

Updated priority:

1. Continue Phase B retrieval strategy routing for `intent + scope`.
2. Strengthen single-entity lookup questions such as `克莱恩是谁？` by mixing definition/identity evidence with current-position evidence.
3. Add deterministic benchmark cases from the NotebookLM comparison.
4. Refine current-chapter coverage for `chapter_summary` if real-question tests show missing chapter events.
5. Start Phase C deep analysis only after the default route is benchmarked.
6. Keep Phase D embeddings optional and evidence-driven.
7. Keep Phase E library-level flows later.

Reasoning:

- Phase A gives the highest quality gain with the lowest storage and latency risk.
- Phase B makes the assistant feel smarter without heavy infrastructure.
- Phase C gives power users a better answer path without slowing default usage.
- Phase D should be evidence-driven, not assumed.
- Phase E becomes valuable after the single-book assistant is trustworthy.

## 9. Key implementation principle

For Readio, the best near-term answer-quality improvement is:

```text
better evidence selection before generation
```

Not:

```text
more hidden preprocessing by default
```

Not:

```text
larger embeddings first
```

Not:

```text
longer prompts without structure
```

The product should feel fast and light by default, but offer a clearly marked deep mode when the user wants more complete analysis.

## 10. Source list

Research papers:

- [HeavySkill: Heavy Thinking as the Inner Skill in Agentic Harness](https://arxiv.org/abs/2605.02396)
- [HeavySkill HTML](https://arxiv.org/html/2605.02396)
- [RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval](https://arxiv.org/abs/2401.18059)
- [LongRAG: Enhancing Retrieval-Augmented Generation with Long-context LLMs](https://arxiv.org/abs/2406.15319)
- [LongRAG: A Dual-Perspective Retrieval-Augmented Generation Paradigm](https://arxiv.org/abs/2410.18050)
- [RankRAG](https://arxiv.org/abs/2407.02485)
- [Hierarchical Re-ranker Retriever](https://arxiv.org/abs/2503.02401)
- [Hierarchical Document Refinement for Long-context RAG](https://arxiv.org/abs/2505.10413)
- [Question Decomposition for RAG](https://arxiv.org/abs/2507.00355)
- [Ground Every Sentence](https://arxiv.org/abs/2407.01796)
- [Groundedness in Retrieval-augmented Long-form Generation](https://arxiv.org/abs/2404.07060)
- [RAGChecker](https://arxiv.org/abs/2408.08067)
- [Sufficient Context](https://arxiv.org/abs/2411.06037)

Product references:

- [NotebookLM Help](https://support.google.com/notebooklm/answer/16164461)
- [Use chat in NotebookLM](https://support.google.com/notebooklm/answer/16179559)
- [Add or discover sources in NotebookLM](https://support.google.com/notebooklm/answer/16215270)
- [NotebookLM Discover Sources](https://blog.google/technology/google-labs/notebooklm-discover-sources/)
- [Knowly](https://goknowly.ai/)
- [Knowly Pricing](https://goknowly.ai/price)
- [Knowly Terms of Service](https://goknowly.ai/terms-of-services)
