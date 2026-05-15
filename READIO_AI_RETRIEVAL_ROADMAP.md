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

## Phase B: Question classification and strategy routing

### Goal

Stop treating every question as the same retrieval problem.

### Plain-language explanation

“解释这句话”和“总结本章”和“这个人物是谁” need different search behavior. The AI should first understand the type of question, then choose the right retrieval strategy.

### Question types

1. Selected-text explanation.
2. Current page / current paragraph question.
3. Current chapter summary.
4. Previous recap.
5. Character or concept lookup.
6. Cross-chapter comparison.
7. Theme or foreshadowing analysis.
8. Spoiler-risk question.
9. Unanswerable-from-current-source question.

### Main work

1. Add a small classifier:
   - rule-based first;
   - LLM-based only if needed later.

2. Map each type to retrieval strategy:
   - selected text: selected passage + neighbor window;
   - current chapter: section coverage;
   - character lookup: first occurrence + latest relevant occurrence + current mention;
   - recap: previous sections only;
   - theme analysis: broader multi-section retrieval;
   - spoiler-risk: strict read-boundary filtering.

3. Adjust prompt style by question type:
   - concise explanation;
   - bullet recap;
   - evidence list;
   - uncertainty note;
   - no-spoiler refusal with known-so-far summary.

### Success criteria

- Different question types produce visibly better evidence selection.
- Character questions do not over-focus only on the latest mention.
- Chapter summaries cover more of the chapter structure.
- Spoiler-risk questions are handled more naturally and safely.

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

1. Phase A: Lightweight RAG v2.
2. Phase B: Question classification and strategy routing.
3. Phase C: Deep analysis / Heavy Read mode.
4. Phase D: Optional embedding / high-quality index.
5. Phase E: Library-level organization and learning flows.

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
