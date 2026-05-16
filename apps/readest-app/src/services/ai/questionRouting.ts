export type ReaderQuestionIntent =
  | 'selection_explanation'
  | 'current_recap'
  | 'entity_lookup'
  | 'chapter_summary'
  | 'analysis'
  | 'general';

export type ReaderAnswerScope = 'read_so_far' | 'whole_book_allowed';

export interface ClassifyReaderQuestionInput {
  question: string;
  selectionText?: string;
  spoilerProtection: boolean;
}

export interface ReaderQuestionClassification {
  intent: ReaderQuestionIntent;
  scope: ReaderAnswerScope;
}

const recapPattern =
  /(前面|之前|刚才|目前|现在).*(发生|讲到|进展|局势|回顾)|发生了什么|回顾一下|讲到哪/;
const chapterSummaryPattern =
  /(总结|概括).*(本章|这一章|当前章节|本节|这一节)|(本章|这章|这一章|当前章节).*(讲了什么|重点|内容)/;
const entityLookupPattern = /(.+)(是谁|是什么|什么地方|什么组织|什么东西|什么意思|指什么)[？?]?$/;
const entityListPattern = /(.+)(成员有哪些|有哪些成员|都有谁|包括谁|有谁|名单)/;
const entityEventPattern =
  /^(?!前面|之前|刚才|目前|现在|这里|这段|上一段)[\p{Script=Han}A-Za-z0-9·]{2,24}(发生了什么|怎么了|后来怎么样|最后怎么样)[？?]?$/u;
const analysisPattern =
  /(为什么|原因|伏笔|暗示|线索|象征|关系|动机|影响|说明什么|意味着什么|怎么看)/;

export const classifyReaderQuestion = ({
  question,
  selectionText,
  spoilerProtection,
}: ClassifyReaderQuestionInput): ReaderQuestionClassification => {
  const normalizedQuestion = question.trim();
  const hasSelection = Boolean(selectionText?.trim());
  const scope: ReaderAnswerScope = spoilerProtection ? 'read_so_far' : 'whole_book_allowed';

  if (hasSelection) return { intent: 'selection_explanation', scope };
  if (chapterSummaryPattern.test(normalizedQuestion)) return { intent: 'chapter_summary', scope };
  if (entityListPattern.test(normalizedQuestion)) return { intent: 'entity_lookup', scope };
  if (entityEventPattern.test(normalizedQuestion)) return { intent: 'entity_lookup', scope };
  if (recapPattern.test(normalizedQuestion)) return { intent: 'current_recap', scope };
  if (analysisPattern.test(normalizedQuestion)) return { intent: 'analysis', scope };
  if (entityLookupPattern.test(normalizedQuestion)) return { intent: 'entity_lookup', scope };

  return { intent: 'general', scope };
};
