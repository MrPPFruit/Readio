import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { PiMagnifyingGlass, PiTrash, PiClockCounterClockwise } from 'react-icons/pi';

import { useTranslation } from '@/hooks/useTranslation';
import { useEnv } from '@/context/EnvContext';
import { useDeviceControlStore } from '@/store/deviceStore';
import { eventDispatcher } from '@/utils/event';
import { openExternalUrl } from '@/utils/open';
import { getAIAvailability } from '@/services/ai/availability';
import { getAIProvider } from '@/services/ai/providers';
import type { AISettings } from '@/services/ai/types';
import { useSettingsStore } from '@/store/settingsStore';
import { useLibraryStore } from '@/store/libraryStore';
import {
  AGGREGATION_SEARCH_DOMAINS,
  buildAggregationSearchUrl,
} from '@/services/aiBookSearch/domainRegistry';
import { canDirectDownloadAIBookFile, downloadAIBookFile } from '@/services/aiBookSearch/download';
import { searchAIBooksTier1, searchAIBooksTier2 } from '@/services/aiBookSearch/searchService';
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
import {
  deleteAIBookSearchHistoryRecord,
  deleteAIBookSearchHistoryRecords,
  listAIBookSearchHistory,
  saveAIBookSearchHistorySnapshot,
} from '@/services/aiBookSearch/history';
import Dialog from '@/components/Dialog';
import type {
  AIBookDownloadLink,
  AIBookSearchHistoryRecord,
  AIBookSearchIntent,
  AIBookSearchProgressEvent,
  AIBookSearchResult,
  AIBookSearchSource,
  AIBookSourceLink,
} from '@/services/aiBookSearch/types';

interface AIBookSearchDialogProps {
  settings: AISettings;
  onClose: () => void;
  onImportRemoteBook: (file: File) => Promise<{ successCount: number; failedCount: number }>;
}

type SearchStatus = 'idle' | 'searching' | 'done' | 'error';
type ImportStatus = 'idle' | 'importing' | 'imported' | 'failed';
type DeepSearchStatus = 'idle' | 'searching' | 'done';
type AIBookSearchNoticeKind = 'disabled' | 'configuration' | 'unavailable';

interface AIBookSearchNotice {
  kind: AIBookSearchNoticeKind;
  title: string;
  body: string;
  actionLabel: string;
  settingsItemId: string;
}

interface PendingExternalOpen {
  title: string;
  url: string;
  label: string;
  requiresCheckbox: boolean;
}

const sourceLabels: Record<AIBookSearchSource, string> = {
  gutendex: 'Gutendex',
  'open-library': 'Open Library',
  github: 'GitHub',
  'internet-archive': 'Internet Archive',
  aggregation: '聚合站',
};

const sourceDescriptions: Record<AIBookSearchSource, string> = {
  gutendex: '公版直链',
  'open-library': '开放图书馆',
  github: '代码仓库',
  'internet-archive': '互联网档案馆',
  aggregation: '外部聚合',
};

const sourceFilterOrder: AIBookSearchSource[] = [
  'gutendex',
  'github',
  'open-library',
  'internet-archive',
];

const aggregationTargets = AGGREGATION_SEARCH_DOMAINS.filter((target) =>
  ['z-library', 'annas-archive', 'libgen'].includes(target.id),
);

const formatLabel = (format: AIBookDownloadLink['format']) => format.toUpperCase();

const metadataText = (result: AIBookSearchResult) =>
  [result.authors.join(', '), result.year, result.language].filter((value) => !!value).join(' · ');

const resultScore = (result: AIBookSearchResult) => result.aiScore ?? result.score ?? 0;

const sortResults = (results: AIBookSearchResult[]) =>
  [...results].sort((left, right) => resultScore(right) - resultScore(left));

const sourceProgressSteps = new Set<AIBookSearchProgressEvent['step']>([
  'tier1-sources',
  'tier2-sources',
]);

const readableProgressLogs = (events: AIBookSearchProgressEvent[]) => events.slice(-3);

const AI_HEALTH_CHECK_CACHE_TTL_MS = 60_000;
const HISTORY_LONG_PRESS_MS = 550;
const aiHealthCheckCache = new Map<string, { result: boolean; checkedAt: number }>();

const aiHealthCheckKey = (settings: AISettings) =>
  JSON.stringify({
    enabled: settings.enabled,
    provider: settings.provider,
    apiKey: settings.providerApiKeys?.[settings.provider]?.trim() ?? '',
    model: settings.providerModels?.[settings.provider]?.trim() ?? '',
    customProviderBaseUrl: settings.customProviderBaseUrl?.trim() ?? '',
    allowUnsafeCustomProviderBaseUrl: settings.allowUnsafeCustomProviderBaseUrl ?? false,
  });

interface LiteraryQuote {
  text: string;
  source: string;
  region: 'china' | 'world';
  period: 'ancient' | 'modern';
}

type LiteraryQuotePool = [LiteraryQuote, ...LiteraryQuote[]];

export const AI_BOOK_SEARCH_LITERARY_QUOTES: LiteraryQuotePool = [
  {
    text: '“凡是过往，皆为序章。”',
    source: '《暴风雨》 · 威廉·莎士比亚',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“生存还是毁灭，这是一个问题。”',
    source: '《哈姆雷特》 · 威廉·莎士比亚',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“黑夜无论怎样悠长，白昼总会到来。”',
    source: '《麦克白》 · 威廉·莎士比亚',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“闪光的东西并不都是金子。”',
    source: '《威尼斯商人》 · 威廉·莎士比亚',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“爱所有人，信任少数人，不负任何人。”',
    source: '《终成眷属》 · 威廉·莎士比亚',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“幸福的家庭都是相似的，不幸的家庭各有各的不幸。”',
    source: '《安娜·卡列尼娜》 · 列夫·托尔斯泰',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人类的一切智慧，都包含在等待和希望之中。”',
    source: '《基督山伯爵》 · 大仲马',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我不是鸟，也没有罗网捕捉我。”',
    source: '《简·爱》 · 夏洛蒂·勃朗特',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我们的灵魂是平等的。”',
    source: '《简·爱》 · 夏洛蒂·勃朗特',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我越是孤独，越是没有朋友，就越是尊重自己。”',
    source: '《简·爱》 · 夏洛蒂·勃朗特',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“虚荣与骄傲虽有不同，却常被混为一谈。”',
    source: '《傲慢与偏见》 · 简·奥斯汀',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“这是最好的时代，也是最坏的时代。”',
    source: '《双城记》 · 查尔斯·狄更斯',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人，有了物质才能生存；人，有了理想才谈得上生活。”',
    source: '《悲惨世界》 · 维克多·雨果',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“自由，是上天赐给人类最珍贵的礼物。”',
    source: '《堂吉诃德》 · 塞万提斯',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人只要奋斗就会犯错。”',
    source: '《浮士德》 · 歌德',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“假如生活欺骗了你，不要悲伤，不要心急。”',
    source: '《假如生活欺骗了你》 · 普希金',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“忍耐吧，我的心，你曾忍受过更重的苦难。”',
    source: '《奥德赛》 · 荷马',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“一个人可以被毁灭，但不能被打败。”',
    source: '《老人与海》 · 海明威',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“真正重要的东西，用眼睛是看不见的。”',
    source: '《小王子》 · 圣埃克苏佩里',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“谁控制过去，谁就控制未来。”',
    source: '《一九八四》 · 乔治·奥威尔',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“世界以痛吻我，要我报之以歌。”',
    source: '《飞鸟集》 · 泰戈尔',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“在隆冬，我终于知道，我身上有一个不可战胜的夏天。”',
    source: '《夏天》 · 阿尔贝·加缪',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“生命从来不曾离开过孤独而独立存在。”',
    source: '《百年孤独》 · 加西亚·马尔克斯',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“一本书必须是凿破我们心中冰海的斧子。”',
    source: '《书信》 · 弗兰茨·卡夫卡',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“无论我们的灵魂是什么做成的，他的和我的是一样的。”',
    source: '《呼啸山庄》 · 艾米莉·勃朗特',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“一个人要写小说，必须有钱，以及一间自己的房间。”',
    source: '《一间自己的房间》 · 弗吉尼亚·伍尔夫',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“人最宝贵的是生命，生命对每个人只有一次。”',
    source: '《钢铁是怎样炼成的》 · 奥斯特洛夫斯基',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“在人的心里，有一片孤独的海。”',
    source: '《小妇人》 · 路易莎·奥尔科特',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我还活着，我还在思考。”',
    source: '《鲁滨逊漂流记》 · 丹尼尔·笛福',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“一个人最需要的，是控制自己的心。”',
    source: '《理智与情感》 · 简·奥斯汀',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“傲慢使别人无法爱我，偏见使我无法爱别人。”',
    source: '《傲慢与偏见》 · 简·奥斯汀',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我爱你，与地位和财富无关。”',
    source: '《简·爱》 · 夏洛蒂·勃朗特',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“野心是一匹奔马，常把骑手摔下。”',
    source: '《麦克白》 · 威廉·莎士比亚',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“迟疑是通向失败的门。”',
    source: '《哈姆雷特》 · 威廉·莎士比亚',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“每个圣人都有过去，每个罪人都有未来。”',
    source: '《温夫人的扇子》 · 奥斯卡·王尔德',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“做你自己，因为别人都有人做了。”',
    source: '《格言集》 · 奥斯卡·王尔德',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我们都在阴沟里，但仍有人仰望星空。”',
    source: '《温夫人的扇子》 · 奥斯卡·王尔德',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“她那时还太年轻，不知道所有馈赠都暗中标好了价格。”',
    source: '《断头王后》 · 茨威格',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“人与人之间，最远的不是距离，而是沉默。”',
    source: '《一个陌生女人的来信》 · 茨威格',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“我要扼住命运的咽喉。”',
    source: '《贝多芬传》 · 罗曼·罗兰',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“真正的光明，绝不是永没有黑暗。”',
    source: '《约翰·克利斯朵夫》 · 罗曼·罗兰',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“认识自己的无知，是认识世界最可靠的方法。”',
    source: '《随笔集》 · 蒙田',
    region: 'world',
    period: 'ancient',
  },
  { text: '“我思故我在。”', source: '《方法谈》 · 笛卡尔', region: 'world', period: 'ancient' },
  {
    text: '“人是会思想的芦苇。”',
    source: '《思想录》 · 帕斯卡尔',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人生而自由，却无往不在枷锁之中。”',
    source: '《社会契约论》 · 卢梭',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人不能两次踏进同一条河流。”',
    source: '《残篇》 · 赫拉克利特',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“未经审视的人生不值得过。”',
    source: '《申辩篇》 · 柏拉图',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“吾爱吾师，吾更爱真理。”',
    source: '《尼各马可伦理学》 · 亚里士多德',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“在深渊边，仍要保持灵魂的秩序。”',
    source: '《沉思录》 · 马可·奥勒留',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人所能忍受的，比自己想象的更多。”',
    source: '《沉思录》 · 马可·奥勒留',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“苦难显才华，好运隐天资。”',
    source: '《诗艺》 · 贺拉斯',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“命运帮助勇敢的人。”',
    source: '《埃涅阿斯纪》 · 维吉尔',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“他看见深渊，也看见自己。”',
    source: '《神曲》 · 但丁',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“走自己的路，让别人说去吧。”',
    source: '《神曲》 · 但丁',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“一个人越知道时间的价值，越感到失去它的痛苦。”',
    source: '《神曲》 · 但丁',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“风车不是巨人，胆怯才是巨人。”',
    source: '《堂吉诃德》 · 塞万提斯',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“不要向井里吐痰，也许你还会来喝水。”',
    source: '《静静的顿河》 · 肖洛霍夫',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“生活总是让我们遍体鳞伤，但后来那些伤会变强壮。”',
    source: '《永别了，武器》 · 海明威',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“勇气是在压力下仍保持优雅。”',
    source: '《午后之死》 · 海明威',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“所有的大人都曾经是孩子。”',
    source: '《小王子》 · 圣埃克苏佩里',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“使沙漠美丽的，是它在某处藏着一口井。”',
    source: '《小王子》 · 圣埃克苏佩里',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“越是没有本领的就越加自命不凡。”',
    source: '《克雷洛夫寓言》 · 克雷洛夫',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人的一生应当这样度过。”',
    source: '《钢铁是怎样炼成的》 · 奥斯特洛夫斯基',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“春天把希望写在每一片新叶上。”',
    source: '《复活》 · 列夫·托尔斯泰',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人不是因为美丽才可爱，而是因为可爱才美丽。”',
    source: '《安娜·卡列尼娜》 · 列夫·托尔斯泰',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“人并不是生来要给打败的。”',
    source: '《老人与海》 · 海明威',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“我想叫你以实玛利。”',
    source: '《白鲸》 · 赫尔曼·梅尔维尔',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我宁可睡在棺材里，也不愿没有书可读。”',
    source: '《白鲸》 · 赫尔曼·梅尔维尔',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“这是阴郁十一月里一个沉闷的夜晚。”',
    source: '《弗兰肯斯坦》 · 玛丽·雪莱',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我也可以成为你的亚当，却宁愿做堕落的天使。”',
    source: '《弗兰肯斯坦》 · 玛丽·雪莱',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“语言是一只裂开的锅，我们敲它来让熊跳舞。”',
    source: '《包法利夫人》 · 福楼拜',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“她渴望爱情，如水手渴望远方的陆地。”',
    source: '《包法利夫人》 · 福楼拜',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“痛苦和苦难，对于宽广的心灵是必要的。”',
    source: '《罪与罚》 · 陀思妥耶夫斯基',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“我唯一担心的是，我不配受我的苦难。”',
    source: '《罪与罚》 · 陀思妥耶夫斯基',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“当格里高尔醒来，他发现自己变成了巨大的甲虫。”',
    source: '《变形记》 · 弗兰茨·卡夫卡',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“门一直开着，只是他等到太晚。”',
    source: '《审判》 · 弗兰茨·卡夫卡',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“人必须靠一件事活着，哪怕只是等待。”',
    source: '《城堡》 · 弗兰茨·卡夫卡',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“别人的罪会在自己胸前发光。”',
    source: '《红字》 · 纳撒尼尔·霍桑',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“她在羞辱中站立，也在沉默中获得力量。”',
    source: '《红字》 · 纳撒尼尔·霍桑',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“河流知道，路总会通向更开阔的地方。”',
    source: '《柳林风声》 · 肯尼思·格雷厄姆',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“最好的旅行，是回到一个有灯的家。”',
    source: '《柳林风声》 · 肯尼思·格雷厄姆',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“明天永远是新的，里面没有错误。”',
    source: '《绿山墙的安妮》 · 露西·蒙哥马利',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“期待事情带来的快乐，是事情本身的一半。”',
    source: '《绿山墙的安妮》 · 露西·蒙哥马利',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“我是猫，还没有名字。”',
    source: '《我是猫》 · 夏目漱石',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“任凭世人怎样冷眼相待，我也还是我。”',
    source: '《我是猫》 · 夏目漱石',
    region: 'world',
    period: 'modern',
  },
  {
    text: '“他见过深渊，所以懂得城墙。”',
    source: '《吉尔伽美什史诗》',
    region: 'world',
    period: 'ancient',
  },
  {
    text: '“纵然不能长生，人仍要留下名字。”',
    source: '《吉尔伽美什史诗》',
    region: 'world',
    period: 'ancient',
  },
  { text: '“关关雎鸠，在河之洲。”', source: '《诗经·关雎》', region: 'china', period: 'ancient' },
  { text: '“青青子衿，悠悠我心。”', source: '《诗经·子衿》', region: 'china', period: 'ancient' },
  {
    text: '“路漫漫其修远兮，吾将上下而求索。”',
    source: '《离骚》 · 屈原',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“逝者如斯夫，不舍昼夜。”',
    source: '《论语》 · 孔子',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“满纸荒唐言，一把辛酸泪。”',
    source: '《红楼梦》 · 曹雪芹',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“假作真时真亦假，无为有处有还无。”',
    source: '《红楼梦》 · 曹雪芹',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“天下大势，分久必合，合久必分。”',
    source: '《三国演义》 · 罗贯中',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“山高自有客行路，水深自有渡船人。”',
    source: '《西游记》 · 吴承恩',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“路见不平，拔刀相助。”',
    source: '《水浒传》 · 施耐庵',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“读书破万卷，下笔如有神。”',
    source: '《奉赠韦左丞丈二十二韵》 · 杜甫',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“长风破浪会有时，直挂云帆济沧海。”',
    source: '《行路难》 · 李白',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“莫听穿林打叶声，何妨吟啸且徐行。”',
    source: '《定风波》 · 苏轼',
    region: 'china',
    period: 'ancient',
  },
  {
    text: '“从来如此，便对么？”',
    source: '《狂人日记》 · 鲁迅',
    region: 'china',
    period: 'modern',
  },
  {
    text: '“城外的人想冲进去，城里的人想逃出来。”',
    source: '《围城》 · 钱锺书',
    region: 'china',
    period: 'modern',
  },
];

const randomLiteraryQuoteIndex = (currentIndex: number) => {
  const nextIndex = Math.floor(Math.random() * AI_BOOK_SEARCH_LITERARY_QUOTES.length);
  return nextIndex === currentIndex
    ? (nextIndex + 1) % AI_BOOK_SEARCH_LITERARY_QUOTES.length
    : nextIndex;
};

const hasPartialSourceFailure = (events: AIBookSearchProgressEvent[]) =>
  events.some((event) => /失败|超时|failed|timeout|error|限流|rate limit/i.test(event.message));

const findDownloadLinksForSource = (result: AIBookSearchResult, sourceLink: AIBookSourceLink) =>
  result.downloadLinks.filter(
    (downloadLink) =>
      downloadLink.source === sourceLink.source &&
      canDirectDownloadAIBookFile(result, downloadLink),
  );

const archiveIdentifier = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    const [section, identifier] = parsedUrl.pathname.split('/').filter(Boolean);
    if ((section === 'details' || section === 'download') && identifier) return identifier;
  } catch {
    return undefined;
  }
  return undefined;
};

const sourceLinkKey = (link: AIBookSourceLink) => {
  const labelKey = link.label ? link.label.trim().toLowerCase() : '';
  if (labelKey) return `${link.source}:${labelKey}`;
  if (link.source === 'internet-archive')
    return `${link.source}:${archiveIdentifier(link.url) ?? link.url}`;
  return `${link.source}:${link.url}`;
};

const detailFormats = (result: AIBookSearchResult) =>
  Array.from(
    new Set([...(result.formats ?? []), ...result.downloadLinks.map((link) => link.format)]),
  );

const sourceDisplayRank = (result: AIBookSearchResult, link: AIBookSourceLink) => {
  if (link.source === result.source) return 0;
  if (link.source === 'gutendex') return 1;
  if (link.source === 'open-library') return 2;
  if (link.source === 'github') return 3;
  if (link.source === 'internet-archive') return 4;
  return 5;
};

const displaySourceLinks = (result: AIBookSearchResult) => {
  const seen = new Set<string>();
  return result.sourceLinks
    .filter((link) => {
      const key = sourceLinkKey(link);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => sourceDisplayRank(result, left) - sourceDisplayRank(result, right));
};

const hasDirectDownload = (result: AIBookSearchResult) =>
  result.downloadLinks.some((downloadLink) => canDirectDownloadAIBookFile(result, downloadLink));

const normalizeBookIdentityText = (text?: string) =>
  (text ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();

const identityTokens = (text?: string) =>
  normalizeBookIdentityText(text).split(' ').filter(Boolean);

const haveSameIdentityTokens = (left?: string, right?: string) => {
  const leftTokens = identityTokens(left);
  const rightTokens = identityTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  if (leftTokens.length !== rightTokens.length) return false;
  const rightSet = new Set(rightTokens);
  return leftTokens.every((token) => rightSet.has(token));
};

const searchResultImportKey = (result: AIBookSearchResult, link: AIBookDownloadLink) =>
  `${result.id}:${link.format}:${link.url}`;

const AIBookSearchDialog = ({ settings, onClose, onImportRemoteBook }: AIBookSearchDialogProps) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();
  const { visibleLibrary } = useLibraryStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [deepSearchStatus, setDeepSearchStatus] = useState<DeepSearchStatus>('idle');
  const [results, setResults] = useState<AIBookSearchResult[]>([]);
  const [intent, setIntent] = useState<AIBookSearchIntent | null>(null);
  const [progressEvents, setProgressEvents] = useState<AIBookSearchProgressEvent[]>([]);
  const [selectedSource, setSelectedSource] = useState<AIBookSearchSource | 'all'>('all');
  const [selectedResult, setSelectedResult] = useState<AIBookSearchResult | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<AIBookSearchHistoryRecord[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [historyStatusMessage, setHistoryStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [importStatuses, setImportStatuses] = useState<Record<string, ImportStatus>>({});
  const [pendingExternalOpen, setPendingExternalOpen] = useState<PendingExternalOpen | null>(null);
  const [externalConfirmed, setExternalConfirmed] = useState(false);
  const [literaryQuoteIndex, setLiteraryQuoteIndex] = useState(() => randomLiteraryQuoteIndex(-1));
  const [isLiteraryQuoteVisible, setIsLiteraryQuoteVisible] = useState(true);
  const [aiHealthCheckPassed, setAIHealthCheckPassed] = useState<boolean | null>(null);
  const [isAINoticeVisible, setIsAINoticeVisible] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recentHistoryButtonRef = useRef<HTMLButtonElement>(null);
  const historyLongPressTimerRef = useRef<number | null>(null);
  const externalCancelButtonRef = useRef<HTMLButtonElement>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const selectedResultRef = useRef<AIBookSearchResult | null>(null);
  const isClosingRef = useRef(false);
  const isClosingFromHistoryRef = useRef(false);

  const aiAvailability = useMemo(() => getAIAvailability(settings), [settings]);
  const aiConfigReady = aiAvailability.status === 'ready';
  const canUseAI = aiConfigReady && aiHealthCheckPassed === true;
  const effectiveAISettings = canUseAI ? settings : { ...settings, enabled: false };

  const aiNotice = useMemo<AIBookSearchNotice | null>(() => {
    if (aiAvailability.status === 'disabled') {
      return {
        kind: 'disabled',
        title: '开启 AI，找书会更准',
        body: '当前会使用基础搜索。配置 AI 后，Readio 可以更好理解书名、作者、语言和格式偏好，并帮你整理更相关的结果。',
        actionLabel: '去设置 AI',
        settingsItemId: aiAvailability.settingsItemId,
      };
    }

    if (aiAvailability.status !== 'ready') {
      return {
        kind: 'configuration',
        title: 'AI 配置还没完成',
        body: '当前会先使用基础搜索。补全 AI 模型配置后，Readio 可以更准确地理解搜索意图并优化结果排序。',
        actionLabel: '去设置 AI',
        settingsItemId: aiAvailability.settingsItemId,
      };
    }

    if (aiHealthCheckPassed === false) {
      return {
        kind: 'unavailable',
        title: '当前 AI 模型暂时不可用',
        body: 'Readio 会先使用基础搜索。你可以检查 API Key、模型名称或服务连接后再试。',
        actionLabel: '检查 AI 设置',
        settingsItemId: 'settings.ai.apiKey',
      };
    }

    return null;
  }, [aiAvailability, aiHealthCheckPassed]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    setIsAINoticeVisible(true);
  }, [aiNotice?.kind, aiNotice?.settingsItemId]);

  useEffect(() => {
    if (!aiConfigReady) {
      setAIHealthCheckPassed(null);
      return;
    }

    const cacheKey = aiHealthCheckKey(settings);
    const cachedResult = aiHealthCheckCache.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.checkedAt < AI_HEALTH_CHECK_CACHE_TTL_MS) {
      setAIHealthCheckPassed(cachedResult.result);
      return;
    }

    let isCancelled = false;
    setAIHealthCheckPassed(null);
    getAIProvider(settings)
      .healthCheck()
      .then((result) => {
        aiHealthCheckCache.set(cacheKey, { result, checkedAt: Date.now() });
        if (!isCancelled) setAIHealthCheckPassed(result);
      })
      .catch(() => {
        aiHealthCheckCache.set(cacheKey, { result: false, checkedAt: Date.now() });
        if (!isCancelled) setAIHealthCheckPassed(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [aiConfigReady, settings]);

  useEffect(() => {
    if (!aiNotice || !isAINoticeVisible) return;
    const timeoutId = window.setTimeout(() => setIsAINoticeVisible(false), 10_000);
    return () => window.clearTimeout(timeoutId);
  }, [aiNotice, isAINoticeVisible]);

  const openAISettings = (settingsItemId: string) => {
    const { setActiveSettingsItemId, setSettingsDialogOpen } = useSettingsStore.getState();
    setActiveSettingsItemId(settingsItemId);
    setSettingsDialogOpen(true);
  };

  useEffect(() => {
    let fadeTimeout: number | undefined;
    const interval = window.setInterval(() => {
      setIsLiteraryQuoteVisible(false);
      fadeTimeout = window.setTimeout(() => {
        setLiteraryQuoteIndex((currentIndex) => randomLiteraryQuoteIndex(currentIndex));
        setIsLiteraryQuoteVisible(true);
      }, 200);
    }, 30_000);
    return () => {
      window.clearInterval(interval);
      if (fadeTimeout !== undefined) window.clearTimeout(fadeTimeout);
    };
  }, []);

  const literaryQuote =
    AI_BOOK_SEARCH_LITERARY_QUOTES[literaryQuoteIndex] ?? AI_BOOK_SEARCH_LITERARY_QUOTES[0];

  const openDetail = (result: AIBookSearchResult, trigger?: HTMLElement) => {
    detailTriggerRef.current = trigger ?? null;
    selectedResultRef.current = result;
    setSelectedResult(result);
  };

  const historySelectionMode = selectedHistoryIds.length > 0;

  const loadHistoryRecords = async () => {
    const records = await listAIBookSearchHistory();
    setHistoryRecords(records);
    return records;
  };

  const openHistorySheet = async () => {
    setIsHistoryOpen(true);
    setSelectedHistoryIds([]);
    setHistoryStatusMessage('');
    await loadHistoryRecords();
  };

  const closeHistorySheet = () => {
    setIsHistoryOpen(false);
    setSelectedHistoryIds([]);
    recentHistoryButtonRef.current?.focus({ preventScroll: true });
  };

  const restoreHistoryRecord = (record: AIBookSearchHistoryRecord) => {
    setQuery(record.query);
    setResults(record.results);
    setIntent(record.intent);
    setStatus('done');
    setDeepSearchStatus(record.deepSearchStatus);
    setSelectedSource(record.selectedSource);
    setProgressEvents(
      record.progressSummary.length > 0
        ? record.progressSummary
        : [
            {
              step: 'done',
              message: _('已从最近寻书恢复 {{count}} 条线索', { count: record.resultCount }),
              timestamp: Date.now(),
            },
          ],
    );
    setErrorMessage('');
    setSelectedResult(null);
    selectedResultRef.current = null;
    setPendingExternalOpen(null);
    setExternalConfirmed(false);
    setImportStatuses({});
    setHistoryStatusMessage(
      _('已恢复寻书结果：{{query}}，找到 {{count}} 本线索', {
        query: record.query,
        count: record.resultCount,
      }),
    );
    closeHistorySheet();
  };

  const deleteHistoryRecord = async (id: string) => {
    await deleteAIBookSearchHistoryRecord(id);
    await loadHistoryRecords();
  };

  const toggleHistorySelection = (id: string) => {
    setSelectedHistoryIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    );
  };

  const enterHistorySelection = (id: string) => {
    setSelectedHistoryIds([id]);
    setHistoryStatusMessage(_('已进入多选模式'));
  };

  const handleHistoryPointerDown = (record: AIBookSearchHistoryRecord) => {
    if (historySelectionMode) return;
    if (historyLongPressTimerRef.current !== null)
      window.clearTimeout(historyLongPressTimerRef.current);
    historyLongPressTimerRef.current = window.setTimeout(() => {
      historyLongPressTimerRef.current = null;
      enterHistorySelection(record.id);
    }, HISTORY_LONG_PRESS_MS);
  };

  const cancelHistoryLongPress = () => {
    if (historyLongPressTimerRef.current === null) return;
    window.clearTimeout(historyLongPressTimerRef.current);
    historyLongPressTimerRef.current = null;
  };

  const deleteSelectedHistoryRecords = async () => {
    if (selectedHistoryIds.length === 0) return;
    await deleteAIBookSearchHistoryRecords(selectedHistoryIds);
    setHistoryStatusMessage(_('已删除 {{count}} 条寻书记录', { count: selectedHistoryIds.length }));
    setSelectedHistoryIds([]);
    await loadHistoryRecords();
  };

  const closeDetail = () => {
    selectedResultRef.current = null;
    setSelectedResult(null);
    detailTriggerRef.current?.focus({ preventScroll: true });
    detailTriggerRef.current = null;
  };

  const closeDialog = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    onClose();
    if (!isClosingFromHistoryRef.current) {
      window.history.back();
    }
  };

  const closeExternalNotice = () => {
    setPendingExternalOpen(null);
    setExternalConfirmed(false);
  };

  const closeDetailOrDialog = () => {
    if (pendingExternalOpen) {
      closeExternalNotice();
      return;
    }
    if (isHistoryOpen) {
      closeHistorySheet();
      return;
    }
    if (selectedResultRef.current) {
      closeDetail();
      return;
    }
    closeDialog();
  };

  useEffect(() => {
    window.history.pushState({ readioAIBookSearch: true }, '');

    const closeOnBrowserBack = () => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      isClosingFromHistoryRef.current = true;
      onClose();
    };

    window.addEventListener('popstate', closeOnBrowserBack);
    return () => {
      window.removeEventListener('popstate', closeOnBrowserBack);
    };
  }, [onClose]);

  useEffect(() => {
    if (!appService?.isAndroidApp) return;

    const closeOnNativeBack = (event: CustomEvent) => {
      if (event.detail.keyName !== 'Back') return false;
      closeDetailOrDialog();
      return true;
    };

    acquireBackKeyInterception();
    eventDispatcher.onSync('native-key-down', closeOnNativeBack);
    return () => {
      eventDispatcher.offSync('native-key-down', closeOnNativeBack);
      releaseBackKeyInterception();
    };
  }, [appService?.isAndroidApp, acquireBackKeyInterception, releaseBackKeyInterception]);

  const filteredResults = useMemo(
    () => results.filter((result) => selectedSource === 'all' || result.source === selectedSource),
    [results, selectedSource],
  );

  const sourceCounts = useMemo(() => {
    const counts = new Map<AIBookSearchSource, number>();
    for (const result of results) {
      counts.set(result.source, (counts.get(result.source) ?? 0) + 1);
    }
    return counts;
  }, [results]);

  const importableCount = useMemo(
    () => results.filter((result) => hasDirectDownload(result)).length,
    [results],
  );
  const isResultOnShelf = useMemo(() => {
    const books = visibleLibrary.filter((book) => !book.deletedAt);
    return (result: AIBookSearchResult, link?: AIBookDownloadLink) => {
      const resultTitle = normalizeBookIdentityText(result.title);
      const resultFormats = new Set([
        ...(result.formats ?? []),
        ...result.downloadLinks.map((downloadLink) => downloadLink.format),
      ]);
      const importKey = link ? searchResultImportKey(result, link) : undefined;
      const importedBySession = importKey ? importStatuses[importKey] === 'imported' : false;
      if (importedBySession) return true;

      return books.some((book) => {
        if (link && book.format.toLowerCase() !== link.format) return false;
        if (
          !link &&
          resultFormats.size > 0 &&
          !resultFormats.has(book.format.toLowerCase() as AIBookDownloadLink['format'])
        )
          return false;
        if (normalizeBookIdentityText(book.title) !== resultTitle) return false;
        return (
          !result.authors.length ||
          !book.author ||
          result.authors.some((author) => haveSameIdentityTokens(book.author, author))
        );
      });
    };
  }, [importStatuses, visibleLibrary]);
  const sourceCount = sourceCounts.size;
  const hasSourceWarning = hasPartialSourceFailure(progressEvents);
  const isActiveProgress = status === 'searching' || deepSearchStatus === 'searching';
  const progressCopy = (() => {
    if (deepSearchStatus === 'searching') {
      return canUseAI
        ? { heading: _('正在深度寻书...'), badge: _('深搜中') }
        : { heading: _('正在补查更多书源'), badge: _('补查中') };
    }
    if (status === 'searching') {
      const isOrganizingResults = progressEvents.some(
        (event) => event.step === 'ai-scoring' || event.step === 'dedupe',
      );
      if (isOrganizingResults) return { heading: _('正在整理结果...'), badge: _('整理中') };

      const isSearchingSources = progressEvents.some((event) =>
        sourceProgressSteps.has(event.step),
      );
      if (!canUseAI) return { heading: _('正在搜索开放图书来源'), badge: _('搜索中') };
      return isSearchingSources
        ? { heading: _('正在为你寻书...'), badge: _('寻书中') }
        : { heading: _('正在理解你的想法...'), badge: _('理解中') };
    }
    if (status === 'done' && hasSourceWarning)
      return { heading: _('已寻过部分书源'), badge: _('部分完成') };
    if (status === 'done' && results.length > 0)
      return { heading: _('为你整理了这些书'), badge: _('已整理') };
    if (status === 'done') return { heading: _('暂时没有遇见合适的书'), badge: _('已寻过') };
    if (status === 'error') return { heading: _('寻书路上卡了一下'), badge: _('需重试') };
    return canUseAI
      ? { heading: _('正在理解你的想法...'), badge: _('理解中') }
      : { heading: _('使用基础搜索检索开放图书来源'), badge: _('基础搜索') };
  })();

  const recordProgress = (event: AIBookSearchProgressEvent) => {
    setProgressEvents((prev) => [...prev, event]);
  };

  const saveHistorySnapshot = async (
    input: Parameters<typeof saveAIBookSearchHistorySnapshot>[0],
  ) => {
    try {
      await saveAIBookSearchHistorySnapshot(input);
    } catch (error) {
      console.warn('Failed to save AI book search history snapshot', error);
    }
  };

  const search = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || status === 'searching') return;

    setStatus('searching');
    setDeepSearchStatus('idle');
    setErrorMessage('');
    setResults([]);
    setIntent(null);
    setSelectedSource('all');
    closeDetail();
    setImportStatuses({});
    setIsAINoticeVisible(false);
    const currentProgressEvents: AIBookSearchProgressEvent[] = [
      {
        step: canUseAI ? 'intent' : 'tier1-sources',
        message: canUseAI ? _('AI 正在理解书名、作者和语言偏好') : _('正在搜索开放图书来源'),
        timestamp: Date.now(),
      },
    ];
    const recordCurrentProgress = (event: AIBookSearchProgressEvent) => {
      currentProgressEvents.push(event);
      recordProgress(event);
    };
    setProgressEvents([...currentProgressEvents]);
    void logDiagnosticEvent('ai_book_search.search_started', 'info', {
      provider: effectiveAISettings.provider,
      model: effectiveAISettings.providerModels[effectiveAISettings.provider] ?? '',
      queryLength: trimmedQuery.length,
      aiEnabled: effectiveAISettings.enabled,
    });

    try {
      const response = await searchAIBooksTier1(trimmedQuery, effectiveAISettings, {
        onProgress: recordCurrentProgress,
      });
      const sortedResults = sortResults(response.results);
      const doneProgress: AIBookSearchProgressEvent = {
        step: 'done',
        message:
          response.results.length > 0
            ? _('已整理出 {{count}} 个结果，其中 {{importableCount}} 本可直接导入书架', {
                count: response.results.length,
                importableCount: response.results.filter((result) => hasDirectDownload(result))
                  .length,
              })
            : _('暂时没有遇见合适的书，可以换个说法再试试'),
        timestamp: Date.now(),
      };
      setIntent(response.intent);
      setResults(sortedResults);
      setStatus('done');
      recordCurrentProgress(doneProgress);
      void logDiagnosticEvent('ai_book_search.search_completed', 'info', {
        provider: effectiveAISettings.provider,
        model: effectiveAISettings.providerModels[effectiveAISettings.provider] ?? '',
        queryLength: trimmedQuery.length,
        resultCount: sortedResults.length,
        importableCount: sortedResults.filter((result) => hasDirectDownload(result)).length,
        aiEnabled: effectiveAISettings.enabled,
      });
      await saveHistorySnapshot({
        query: trimmedQuery,
        results: sortedResults,
        intent: response.intent,
        selectedSource: 'all',
        deepSearchStatus: 'idle',
        progressEvents: currentProgressEvents,
      });
    } catch (error) {
      void logDiagnosticError('ai_book_search.search_failed', error, {
        provider: effectiveAISettings.provider,
        model: effectiveAISettings.providerModels[effectiveAISettings.provider] ?? '',
        queryLength: trimmedQuery.length,
        aiEnabled: effectiveAISettings.enabled,
      });
      setErrorMessage(error instanceof Error ? error.message : _('找书路上卡了一下。'));
      setStatus('error');
    }
  };

  const runDeepSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !intent || deepSearchStatus !== 'idle') return;

    setDeepSearchStatus('searching');
    const currentProgressEvents = [...progressEvents];
    const recordCurrentProgress = (event: AIBookSearchProgressEvent) => {
      currentProgressEvents.push(event);
      recordProgress(event);
    };
    recordCurrentProgress({
      step: 'tier2-sources',
      message: canUseAI ? _('AI 正在换一种关键词补查') : _('正在补查更多书源'),
      timestamp: Date.now(),
    });
    try {
      const response = await searchAIBooksTier2(
        trimmedQuery,
        intent,
        results,
        effectiveAISettings,
        { onProgress: recordCurrentProgress },
      );
      const mergedResults = sortResults([...results, ...response.results]);
      const doneProgress: AIBookSearchProgressEvent = {
        step: 'done',
        message:
          response.results.length > 0
            ? _('深度搜索找到 {{count}} 条新线索，已合并到结果中', {
                count: response.results.length,
              })
            : _('深度搜索没有找到新的合适结果'),
        timestamp: Date.now(),
      };
      setResults(mergedResults);
      setDeepSearchStatus('done');
      recordCurrentProgress(doneProgress);
      await saveHistorySnapshot({
        query: trimmedQuery,
        results: mergedResults,
        intent,
        selectedSource,
        deepSearchStatus: 'done',
        progressEvents: currentProgressEvents,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : _('深度搜索失败'));
      setDeepSearchStatus('idle');
    }
  };

  const importBook = async (result: AIBookSearchResult, link: AIBookDownloadLink) => {
    const key = searchResultImportKey(result, link);
    if (importStatuses[key] === 'importing' || isResultOnShelf(result, link)) return;

    setImportStatuses((prev) => ({ ...prev, [key]: 'importing' }));
    try {
      const file = await downloadAIBookFile(result, link);
      const summary = await onImportRemoteBook(file);
      setImportStatuses((prev) => ({
        ...prev,
        [key]: summary.failedCount === 0 ? 'imported' : 'failed',
      }));
    } catch (error) {
      void logDiagnosticError('ai_book_search.import_failed', error, {
        resultSource: result.source,
        linkSource: link.source,
        linkFormat: link.format,
        resultIdLength: result.id.length,
        linkIndex: result.downloadLinks.indexOf(link),
      });
      setImportStatuses((prev) => ({ ...prev, [key]: 'failed' }));
    }
  };

  const requestOpenExternal = async (
    url: string,
    title: string,
    label: string,
    requiresCheckbox = false,
  ) => {
    if (!requiresCheckbox) {
      await openExternalUrl(url);
      return;
    }
    setExternalConfirmed(false);
    setPendingExternalOpen({ title, url, label, requiresCheckbox });
  };

  useEffect(() => {
    if (!pendingExternalOpen) return;
    externalCancelButtonRef.current?.focus({ preventScroll: true });
  }, [pendingExternalOpen]);

  useLayoutEffect(() => {
    if (!appService?.isAndroidApp || !pendingExternalOpen) return;

    const closeExternalNoticeOnNativeBack = (event: CustomEvent) => {
      if (event.detail.keyName !== 'Back') return false;
      closeExternalNotice();
      return true;
    };

    eventDispatcher.onSync('native-key-down', closeExternalNoticeOnNativeBack);
    return () => eventDispatcher.offSync('native-key-down', closeExternalNoticeOnNativeBack);
  }, [appService?.isAndroidApp, pendingExternalOpen]);

  const confirmOpenExternal = async () => {
    if (!pendingExternalOpen || (pendingExternalOpen.requiresCheckbox && !externalConfirmed))
      return;
    const url = pendingExternalOpen.url;
    closeExternalNotice();
    await openExternalUrl(url);
  };

  const statusText =
    status === 'searching'
      ? progressCopy.heading
      : status === 'done' && results.length > 0
        ? _('搜索完成，找到 {{count}} 个结果，{{importableCount}} 个可导入', {
            count: results.length,
            importableCount,
          })
        : status === 'done'
          ? _('搜索完成，暂时没有遇见合适的书')
          : status === 'error'
            ? errorMessage
            : canUseAI
              ? _('输入书名、作者或主题，全网检索图书资源')
              : _('使用基础搜索检索开放图书来源');

  return (
    <div
      role='region'
      aria-label={_('全网搜书')}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (pendingExternalOpen) {
          if (event.key === 'Escape') closeExternalNotice();
          return;
        }
        if (isHistoryOpen) {
          if (event.key === 'Escape') closeHistorySheet();
          return;
        }
        if (selectedResult) {
          if (event.key === 'Escape') closeDetail();
          return;
        }
        if (event.key === 'Escape') closeDialog();
      }}
      className='bg-base-100 text-base-content relative flex h-[100dvh] w-screen flex-col overflow-hidden'
    >
      <p className='sr-only' aria-live='polite'>
        {statusText}
      </p>
      {aiNotice && isAINoticeVisible && (
        <section className='pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] transition-transform duration-200 ease-out motion-reduce:transition-none sm:px-6'>
          <div className='bg-base-100/95 border-base-content/10 pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border p-4 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0' role='status' aria-live='polite'>
              <p className='text-sm font-semibold'>{_(aiNotice.title)}</p>
              <p className='text-base-content/65 mt-1 text-xs leading-5'>{_(aiNotice.body)}</p>
            </div>
            <button
              type='button'
              className='btn btn-primary btn-sm shrink-0 rounded-full'
              onClick={() => openAISettings(aiNotice.settingsItemId)}
            >
              {_(aiNotice.actionLabel)}
            </button>
          </div>
        </section>
      )}
      <main className='min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[max(env(safe-area-inset-top),2rem)] sm:px-6'>
        <div className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
          <div className='bg-base-200/45 border-base-content/10 flex items-center gap-2 rounded-full border p-1.5'>
            <label className='sr-only' htmlFor='ai-book-search-input'>
              {_('搜索书籍')}
            </label>
            <input
              ref={searchInputRef}
              id='ai-book-search-input'
              type='text'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') search();
              }}
              placeholder={_('想读什么？书名、作者，或一个念头。')}
              className='input placeholder:text-base-content/45 h-11 min-w-0 flex-1 rounded-full border-0 bg-transparent px-4 text-base focus:outline-none focus:ring-0'
              disabled={status === 'searching'}
            />
            <button
              type='button'
              className='btn btn-primary h-11 min-h-11 w-11 shrink-0 rounded-full p-0'
              onClick={search}
              disabled={!query.trim() || status === 'searching'}
              aria-label={_('搜索')}
            >
              <PiMagnifyingGlass role='none' className='h-5 w-5' />
            </button>
          </div>

          <div className='flex items-center justify-start'>
            <button
              ref={recentHistoryButtonRef}
              type='button'
              className='btn btn-outline btn-sm border-base-content/15 bg-base-100/70 text-base-content/70 min-h-10 rounded-full px-4'
              onClick={openHistorySheet}
            >
              <PiClockCounterClockwise role='none' className='h-4 w-4' />
              {_('最近寻书')}
            </button>
          </div>

          {progressEvents.length > 0 && (
            <section className='bg-base-200/50 rounded-2xl p-3'>
              <div className='flex items-center justify-between gap-3'>
                <h2 className='text-sm font-medium leading-5'>{progressCopy.heading}</h2>
                <span
                  className={clsx(
                    'badge badge-ghost badge-sm text-[11px]',
                    isActiveProgress && 'readio-ai-search-progress-badge--active',
                  )}
                >
                  {progressCopy.badge}
                </span>
              </div>
              <ul className='mt-2 space-y-1 text-[11px] leading-4'>
                {readableProgressLogs(progressEvents).map((event, index) => (
                  <li
                    key={`${event.step}:${event.timestamp ?? index}`}
                    className='text-base-content/60 flex gap-2'
                  >
                    <span className='text-base-content/35' aria-hidden='true'>
                      •
                    </span>
                    <span>{event.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {status === 'idle' && (
            <section
              data-testid='ai-book-search-literary-quote'
              aria-hidden='true'
              className={clsx(
                'text-base-content/55 flex min-h-64 flex-col items-center justify-center overflow-hidden px-6 text-center leading-6 transition-opacity duration-200 ease-out motion-reduce:opacity-100 motion-reduce:transition-none',
                isLiteraryQuoteVisible ? 'opacity-100' : 'opacity-0',
              )}
            >
              <p
                data-testid='ai-book-search-literary-quote-text'
                className='text-base-content/70 line-clamp-4 break-words text-base leading-7'
              >
                {_(literaryQuote.text)}
              </p>
              <p className='text-base-content/45 mt-2 line-clamp-2 break-words text-xs tracking-[0.08em]'>
                {_(literaryQuote.source)}
              </p>
            </section>
          )}

          {results.length > 0 && (
            <>
              <section className='grid grid-cols-3 gap-2 text-center text-sm'>
                <div className='bg-base-200/60 rounded-xl p-3'>
                  <div className='text-lg font-semibold'>{results.length}</div>
                  <div className='text-base-content/60'>{_('遇见结果')}</div>
                </div>
                <div className='bg-base-200/60 rounded-xl p-3'>
                  <div className='text-lg font-semibold'>{importableCount}</div>
                  <div className='text-base-content/60'>{_('可带回')}</div>
                </div>
                <div className='bg-base-200/60 rounded-xl p-3'>
                  <div className='text-lg font-semibold'>{sourceCount}</div>
                  <div className='text-base-content/60'>{_('书路')}</div>
                </div>
              </section>

              <h2 className='sr-only'>{_('搜索结果')}</h2>
              <div className='flex flex-wrap gap-2'>
                <button
                  type='button'
                  className={clsx(
                    'btn btn-xs rounded-full',
                    selectedSource === 'all' ? 'btn-primary' : 'btn-outline',
                  )}
                  aria-pressed={selectedSource === 'all'}
                  onClick={() => setSelectedSource('all')}
                >
                  {_('全部 {{count}}', { count: results.length })}
                </button>
                {sourceFilterOrder.map((source) => {
                  const count = sourceCounts.get(source) ?? 0;
                  if (source === 'internet-archive' && count === 0) return null;
                  return (
                    <button
                      key={source}
                      type='button'
                      className={clsx(
                        'btn btn-xs rounded-full',
                        selectedSource === source ? 'btn-primary' : 'btn-outline',
                      )}
                      aria-pressed={selectedSource === source}
                      onClick={() => setSelectedSource(source)}
                      disabled={count === 0}
                    >
                      {sourceLabels[source]} {count}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {status === 'done' && (
            <section className='border-base-300 bg-base-100/80 rounded-2xl border p-4'>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  {results.length === 0 ? (
                    <>
                      <h2 className='font-semibold'>{_('暂时没有遇见合适的书。换个说法试试？')}</h2>
                      <p className='text-base-content/60 mt-1 text-xs'>
                        {_('或者使用外部聚合搜索找找')}
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className='font-semibold'>{_('外部聚合搜索（仅跳转，不提供下载）')}</h2>
                      <p className='text-base-content/60 mt-1 text-xs'>
                        {_('需要确认版权风险后才会打开外部网站。')}
                      </p>
                    </>
                  )}
                </div>
                <div className='flex flex-wrap gap-2'>
                  {aggregationTargets.map((target) => {
                    const url = buildAggregationSearchUrl(target.id, query.trim());
                    return (
                      <button
                        key={target.id}
                        type='button'
                        className='btn btn-outline btn-xs'
                        onClick={() =>
                          url &&
                          requestOpenExternal(url, query.trim() || target.label, target.label, true)
                        }
                        disabled={!query.trim() || !url}
                      >
                        {target.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {results.length > 0 && (
            <div className='flex justify-center text-center'>
              <button
                type='button'
                className='btn btn-outline btn-sm h-auto min-h-11 rounded-full px-5 py-2 leading-5'
                onClick={runDeepSearch}
                disabled={!intent || deepSearchStatus !== 'idle'}
              >
                {deepSearchStatus === 'searching' ? (
                  _('深度搜索中...')
                ) : deepSearchStatus === 'done' ? (
                  _('搜索完成')
                ) : (
                  <span className='flex flex-col'>
                    <span>{_('不是那个Ta？深度搜索再试试...')}</span>
                    <span className='text-xs font-normal opacity-70'>
                      {canUseAI
                        ? _('搜索 Internet Archive 及 AI 精炼查询')
                        : _('搜索 Internet Archive 等更多书源')}
                    </span>
                  </span>
                )}
              </button>
            </div>
          )}

          <div className='min-h-0 flex-1 overflow-auto rounded-2xl'>
            {status === 'searching' && results.length === 0 ? (
              <div
                data-testid='ai-book-search-literary-quote'
                aria-hidden='true'
                className={clsx(
                  'text-base-content/55 flex min-h-48 flex-col items-center justify-center overflow-hidden px-4 text-center transition-opacity duration-200 ease-out motion-reduce:opacity-100 motion-reduce:transition-none',
                  isLiteraryQuoteVisible ? 'opacity-100' : 'opacity-0',
                )}
              >
                <p
                  data-testid='ai-book-search-literary-quote-text'
                  className='text-base-content/70 line-clamp-4 break-words text-base leading-7'
                >
                  {_(literaryQuote.text)}
                </p>
                <p className='text-base-content/45 mt-2 line-clamp-2 break-words text-xs tracking-[0.08em]'>
                  {_(literaryQuote.source)}
                </p>
              </div>
            ) : status === 'done' && filteredResults.length === 0 ? (
              <div className='min-h-8' aria-hidden='true' />
            ) : (
              <ul className='grid gap-3'>
                {filteredResults.map((result) => (
                  <li key={result.id}>
                    <article className='border-base-300 bg-base-100 overflow-hidden rounded-2xl border shadow-sm'>
                      <button
                        type='button'
                        className='flex w-full min-w-0 gap-4 p-4 text-left'
                        onClick={(event) => openDetail(result, event.currentTarget)}
                        aria-label={_('查看 {{title}} 详情', { title: result.title })}
                      >
                        <span className='bg-base-200 text-base-content/60 flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs'>
                          {result.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={result.coverUrl}
                              alt=''
                              className='h-full w-full object-cover'
                            />
                          ) : (
                            _('封面')
                          )}
                        </span>
                        <span className='min-w-0 flex-1'>
                          <span className='flex items-start justify-between gap-2'>
                            <span className='min-w-0'>
                              <h3 className='line-clamp-2 text-sm font-semibold'>{result.title}</h3>
                            </span>
                            <span
                              className={clsx(
                                'badge badge-sm shrink-0',
                                result.risk === 'direct-open' ? 'badge-primary' : 'badge-outline',
                              )}
                            >
                              {sourceLabels[result.source]}
                            </span>
                          </span>
                          <span className='text-base-content/60 mt-1 block text-xs'>
                            {metadataText(result)}
                          </span>
                          <span className='mt-2 flex min-w-0 flex-wrap gap-1'>
                            {(
                              result.formats ?? result.downloadLinks.map((link) => link.format)
                            ).map((format) => (
                              <span
                                key={`${result.id}:${format}`}
                                className='badge badge-ghost badge-sm'
                              >
                                {formatLabel(format)}
                              </span>
                            ))}
                            {result.licenseLabel && (
                              <span className='badge badge-outline badge-sm'>
                                {result.licenseLabel}
                              </span>
                            )}
                            {result.risk === 'direct-open' && (
                              <span className='badge badge-outline badge-sm'>
                                {_('可直接导入')}
                              </span>
                            )}
                            {resultScore(result) >= 20 && (
                              <span className='badge badge-outline badge-sm'>
                                {_('相关度 {{score}}', { score: resultScore(result) })}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      <p className='sr-only' aria-live='polite'>
        {historyStatusMessage}
      </p>

      {isHistoryOpen && (
        <Dialog
          isOpen={true}
          title={_('最近寻书')}
          snapHeight={0.7}
          dragHandleLabel={_('下拉关闭最近寻书')}
          header={<div className='sr-only'>{_('最近寻书')}</div>}
          className='modal-open'
          bgClassName='bg-base-content/20 backdrop-blur-[1px]'
          boxClassName='sm:max-w-md'
          contentClassName='px-4 sm:px-5'
          onClose={closeHistorySheet}
        >
          <section aria-label={_('最近寻书记录')}>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <p className='text-base-content/55 text-xs leading-5'>
                {_('选择一条记录可恢复之前找到的线索，不会重新搜索。')}
              </p>
              {historyRecords.length > 0 && (
                <button
                  type='button'
                  className='btn btn-ghost btn-xs shrink-0 rounded-full'
                  onClick={() =>
                    setSelectedHistoryIds(historySelectionMode ? [] : [historyRecords[0]!.id])
                  }
                >
                  {historySelectionMode ? _('取消') : _('选择')}
                </button>
              )}
            </div>
            {historySelectionMode && (
              <div className='bg-base-200/55 mb-3 flex items-center justify-between rounded-2xl px-3 py-2'>
                <span className='text-sm font-medium'>
                  {_('已选择 {{count}} 项', { count: selectedHistoryIds.length })}
                </span>
                <button
                  type='button'
                  className='btn btn-error btn-sm min-h-10 rounded-full px-4'
                  onClick={deleteSelectedHistoryRecords}
                  disabled={selectedHistoryIds.length === 0}
                >
                  {_('删除 {{count}} 项', { count: selectedHistoryIds.length })}
                </button>
              </div>
            )}
            {historyRecords.length === 0 ? (
              <div className='flex min-h-48 flex-col items-center justify-center text-center'>
                <p className='font-medium'>{_('还没有寻书记录')}</p>
                <p className='text-base-content/55 mt-2 max-w-64 text-sm leading-6'>
                  {_('搜索完成后会保留最近 30 次结果，方便回来继续看。')}
                </p>
              </div>
            ) : (
              <ul className='divide-base-content/10 divide-y'>
                {historyRecords.map((record) => {
                  const isSelected = selectedHistoryIds.includes(record.id);
                  return (
                    <li
                      key={record.id}
                      data-testid={`ai-book-search-history-row-${record.id}`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        enterHistorySelection(record.id);
                      }}
                    >
                      <div
                        className={clsx(
                          'flex min-h-[72px] items-center gap-3 rounded-2xl px-1 py-2',
                          isSelected && 'bg-primary/10',
                        )}
                        onPointerDown={() => handleHistoryPointerDown(record)}
                        onPointerUp={cancelHistoryLongPress}
                        onPointerCancel={cancelHistoryLongPress}
                        onPointerLeave={cancelHistoryLongPress}
                      >
                        {historySelectionMode && (
                          <input
                            type='checkbox'
                            className='checkbox checkbox-primary checkbox-sm shrink-0'
                            checked={isSelected}
                            onChange={() => toggleHistorySelection(record.id)}
                            aria-label={_('选择寻书记录：{{query}}，找到 {{count}} 本线索', {
                              query: record.query,
                              count: record.resultCount,
                            })}
                          />
                        )}
                        <button
                          type='button'
                          className='focus-visible:ring-primary/40 min-h-14 min-w-0 flex-1 rounded-2xl px-3 text-left focus-visible:outline-none focus-visible:ring-2'
                          onClick={() =>
                            historySelectionMode
                              ? toggleHistorySelection(record.id)
                              : restoreHistoryRecord(record)
                          }
                          aria-label={_('恢复寻书结果：{{query}}，找到 {{count}} 本线索', {
                            query: record.query,
                            count: record.resultCount,
                          })}
                        >
                          <span className='block truncate text-sm font-medium'>{record.query}</span>
                          <span className='text-base-content/50 mt-1 block text-xs'>
                            {_('找到 {{count}} 本线索', { count: record.resultCount })}
                          </span>
                        </button>
                        {!historySelectionMode && (
                          <button
                            type='button'
                            className='btn btn-ghost btn-circle text-base-content/55 min-h-11 w-11 shrink-0'
                            onClick={() => deleteHistoryRecord(record.id)}
                            aria-label={_('删除寻书记录：{{query}}', { query: record.query })}
                          >
                            <PiTrash role='none' className='h-4 w-4' />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </Dialog>
      )}

      {selectedResult && (
        <Dialog
          isOpen={true}
          title={_('书籍详情')}
          snapHeight={0.85}
          dismissible={!pendingExternalOpen}
          dragHandleLabel={_('下拉关闭书籍详情')}
          header={<div className='sr-only'>{_('书籍详情')}</div>}
          className='modal-open z-10'
          bgClassName='bg-base-content/20 backdrop-blur-[1px]'
          boxClassName='bg-base-100/95 border-base-300 shadow-2xl backdrop-blur-md sm:max-w-md'
          contentClassName='!my-0 !px-4 !pb-[calc(env(safe-area-inset-bottom)+4.5rem)] !pt-0 sm:!px-5'
          onClose={closeDetail}
        >
          <div className='mx-auto flex max-w-sm flex-col items-center text-center'>
            <div
              className='bg-base-200 text-base-content/45 flex h-[155px] w-[110px] items-center justify-center overflow-hidden rounded-lg text-xs shadow-sm'
              aria-label={_('{{title}} 封面', { title: selectedResult.title })}
            >
              {selectedResult.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedResult.coverUrl} alt='' className='h-full w-full object-cover' />
              ) : (
                _('封面')
              )}
            </div>
            <h3 className='mt-4 line-clamp-2 text-center text-lg font-semibold leading-snug'>
              {selectedResult.title}
            </h3>
            <p className='text-base-content/55 mt-1 text-center text-xs leading-5'>
              {metadataText(selectedResult)}
            </p>
            <div className='mt-3 flex flex-wrap justify-center gap-1.5'>
              <span className='badge badge-outline badge-sm'>
                {sourceLabels[selectedResult.source]}
              </span>
              {selectedResult.licenseLabel && (
                <span className='badge badge-outline badge-sm'>{selectedResult.licenseLabel}</span>
              )}
              <span className='badge badge-outline badge-sm'>
                {selectedResult.risk === 'direct-open' ? _('可直接导入') : _('外部风险')}
              </span>
              {resultScore(selectedResult) >= 20 && (
                <span className='badge badge-outline badge-sm'>
                  {_('相关度 {{score}}', { score: resultScore(selectedResult) })}
                </span>
              )}
            </div>
          </div>
          {detailFormats(selectedResult).length > 0 && (
            <>
              <h4 className='text-base-content/50 mt-5 text-xs font-medium'>{_('可用格式')}</h4>
              <div className='mt-2 flex flex-wrap gap-2'>
                {detailFormats(selectedResult).map((format) => (
                  <span
                    key={`detail-format:${selectedResult.id}:${format}`}
                    className='bg-base-200/60 border-base-content/10 text-base-content/80 inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs'
                  >
                    {formatLabel(format)}
                  </span>
                ))}
              </div>
            </>
          )}
          <h4 className='text-base-content/50 mt-5 text-xs font-medium'>{_('来源')}</h4>
          <ul className='mt-2 space-y-2'>
            {displaySourceLinks(selectedResult).map((link) => {
              const downloadLinks = findDownloadLinksForSource(selectedResult, link);
              const label = link.label || sourceLabels[link.source];
              return (
                <li
                  key={sourceLinkKey(link)}
                  className={clsx(
                    'flex min-w-0 items-center justify-between gap-3 rounded-2xl px-3 py-2.5',
                    downloadLinks.some(
                      (downloadLink) =>
                        importStatuses[searchResultImportKey(selectedResult, downloadLink)] ===
                        'importing',
                    )
                      ? 'bg-primary/5 ring-primary/10 ring-1'
                      : 'bg-base-200/55',
                  )}
                >
                  <div className='min-w-0 flex-1'>
                    <div className='truncate text-sm font-medium leading-5'>{label}</div>
                    <div className='text-base-content/45 mt-0.5 truncate text-xs leading-4'>
                      {sourceDescriptions[link.source]}
                    </div>
                  </div>
                  <div className='ml-auto flex shrink-0 items-center gap-2'>
                    <button
                      type='button'
                      className='btn btn-outline btn-sm min-h-11 rounded-full px-4'
                      onClick={() =>
                        requestOpenExternal(link.url, selectedResult.title, _('版权提示'))
                      }
                      aria-label={_('访问 {{label}} 来源', { label })}
                    >
                      {_('访问')}
                    </button>
                    {downloadLinks.map((downloadLink) => {
                      const importKey = searchResultImportKey(selectedResult, downloadLink);
                      const importStatus = importStatuses[importKey] ?? 'idle';
                      const isOnShelf = isResultOnShelf(selectedResult, downloadLink);
                      const formattedFormat = formatLabel(downloadLink.format);
                      const isImporting = importStatus === 'importing';
                      const buttonLabel = isOnShelf
                        ? _('已上架')
                        : isImporting
                          ? _('下载中')
                          : formattedFormat;
                      return (
                        <button
                          key={importKey}
                          type='button'
                          className={clsx(
                            'btn btn-sm relative min-h-11 min-w-[5.5rem] overflow-hidden rounded-full px-4',
                            isOnShelf
                              ? 'border-primary/20 bg-primary/10 text-primary disabled:border-primary/20 disabled:bg-primary/10 disabled:text-primary disabled:opacity-100'
                              : 'btn-primary disabled:opacity-80',
                          )}
                          onClick={() => importBook(selectedResult, downloadLink)}
                          disabled={isImporting || isOnShelf}
                          aria-busy={isImporting ? 'true' : undefined}
                          aria-label={
                            isOnShelf
                              ? _('已上架 {{label}} {{format}} 版本', {
                                  label,
                                  format: formattedFormat,
                                })
                              : isImporting
                                ? _('正在下载 {{label}} {{format}} 版本', {
                                    label,
                                    format: formattedFormat,
                                  })
                                : _('下载 {{label}} {{format}} 版本', {
                                    label,
                                    format: formattedFormat,
                                  })
                          }
                        >
                          {isImporting && (
                            <span
                              role='progressbar'
                              aria-label={_('{{label}} {{format}} 下载进度', {
                                label,
                                format: formattedFormat,
                              })}
                              className='bg-primary-content/25 absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-full'
                            >
                              <span className='bg-primary-content/80 block h-full w-2/3 animate-pulse rounded-full motion-reduce:animate-none' />
                            </span>
                          )}
                          {buttonLabel}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          {selectedResult.description && (
            <section className='mt-5'>
              <h4 className='text-base-content/50 text-xs font-medium'>{_('简介')}</h4>
              <p className='text-base-content/70 mt-2 text-sm leading-6'>
                {selectedResult.description}
              </p>
            </section>
          )}
          {selectedResult.aiReason && (
            <section className='border-primary/15 bg-primary/5 mt-5 rounded-2xl border p-3'>
              <h4 className='text-primary/80 text-[11px] font-medium tracking-[0.03em]'>
                {_('AI 推荐理由')}
              </h4>
              <p className='text-base-content/70 mt-1 text-sm leading-6'>
                {selectedResult.aiReason}
              </p>
            </section>
          )}
        </Dialog>
      )}

      {pendingExternalOpen && (
        <div className='bg-base-content/50 absolute inset-0 z-20 flex items-center justify-center px-4'>
          <div
            role='alertdialog'
            aria-modal='true'
            aria-label={pendingExternalOpen.requiresCheckbox ? _('版权风险提示') : _('版权提示')}
            className='bg-base-100 border-base-300 w-full max-w-lg rounded-2xl border p-4 shadow-2xl'
          >
            <h3 className='font-semibold'>
              {pendingExternalOpen.requiresCheckbox ? _('版权风险提示') : _('版权提示')}
            </h3>
            <p className='text-base-content/70 mt-2 text-sm'>
              {_(
                '即将打开外部来源。请确认你所在地区的版权状态与下载权限，Readio 不会自动下载该来源文件。',
              )}
            </p>
            {pendingExternalOpen.requiresCheckbox && (
              <label className='mt-3 flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  className='checkbox checkbox-sm'
                  checked={externalConfirmed}
                  onChange={(event) => setExternalConfirmed(event.target.checked)}
                />
                <span>{_('我已知悉以上风险，仅用于个人学习/研究')}</span>
              </label>
            )}
            <div className='mt-4 flex justify-end gap-2'>
              <button
                type='button'
                className='btn btn-ghost btn-sm'
                ref={externalCancelButtonRef}
                onClick={closeExternalNotice}
              >
                {_('取消')}
              </button>
              <button
                type='button'
                className='btn btn-primary btn-sm'
                onClick={confirmOpenExternal}
                disabled={pendingExternalOpen.requiresCheckbox && !externalConfirmed}
              >
                {pendingExternalOpen.requiresCheckbox ? _('继续访问') : _('继续打开')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIBookSearchDialog;
