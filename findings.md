# Findings

## Reader AI Phase B — intent/scope split

- Product decision: spoiler protection is a source-scope control, not a question intent.
- `read_so_far` means spoiler protection is enabled and retrieval/answers should be limited to the current reading boundary.
- `whole_book_allowed` means spoiler protection is disabled and whole-book evidence may be used, but answers should label when they rely on whole-book/later information.
- Local questions like selected-text explanation should still prioritize local context even when `whole_book_allowed`; do not force irrelevant ending spoilers into every answer.
- First implementation step should be a pure deterministic classifier, not LLM routing or heavy retrieval changes.
- Implemented initial classifier recognizes selected-text explanation, current recap, entity lookup, chapter summary, analysis, and general fallback.
- Classifier scope is determined only by `spoilerProtection`: true -> `read_so_far`, false -> `whole_book_allowed`.
- Classifier metadata is now passed through reader chat prompt/context paths: `readerChatService`, `TauriChatAdapter`, and the browser `/api/ai/chat` reader context validation.
- Prompt guidance now tells the model the question intent and answer scope, including known-so-far vs whole-book evidence labeling.
- API validation rejects client-supplied classification scope when it conflicts with effective `spoilerProtection`; scope remains derived from spoiler state.
- Whole-book prompts now label passages with `source_scope="whole_book_allowed" reading_position="..."` instead of implying a current-page evidence limit.
- High-risk spoiler wording under `read_so_far` now still goes through bounded retrieval and prompt guidance, so it can discuss available clues instead of bypassing the RAG chain with a canned refusal.
- Empty-context prompt wording is scope-aware: whole-book requests no longer say only read-so-far content is missing.
- The classifier is not yet used to vary retrieval strategy; next step should map `intent + scope` to retrieval behavior for entity lookup, selected-text explanation, and current recap first.
