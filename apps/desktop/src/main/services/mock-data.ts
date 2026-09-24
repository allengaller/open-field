/**
 * 演示数据（mock）—— 改这个文件即可改演示内容。
 *
 * 使用方式：应用「概览 → 演示数据 → 载入演示数据」。
 * - 所有 ID 都带 `demo` 前缀，清除时按这份文件里的 ID 列表删除，不会碰你自己的数据
 * - 采集物内容写入真实封存区（originals/），哈希与证据链条目都是真的，校验可通过
 * - 证据链日志为 append-only：清除演示数据会删业务行与文件，但链条目保留（铁律）
 * - 时间戳用相对天数（dayOffset 从今天往前算），改小些即可让演示数据"更新"
 */

export interface MockEvent {
  id: string;
  dayOffset: number; // 几天前
  date: string; // 显示用日期，需与 dayOffset 大体一致
  cityCode: string;
  locationName: string;
  contextNote?: string;
}

export interface MockParticipant {
  pseudonym: string;
  industry?: string;
  region?: string;
  referralChain?: string[]; // 引荐链：谁把 TA 介绍给你（滚雪球抽样证据）
  consentScope?: ('recording' | 'portrait' | 'publication')[];
}

export interface MockEncounter {
  id: string;
  eventId: string;
  participantRef: string;
  samplingReason: string;
  dayOffset: number;
  note?: string;
}

export interface MockArtifact {
  id: string; // art-demo-…，同时是 originals/ 下的封存目录名
  filename: string; // 扩展名决定类型：wav/jpg/md/txt/pdf…
  encounterId?: string;
  eventId?: string;
  dayOffset: number;
  content: string; // 文本内容即文件字节；想换演示文件就改这里
  makeCitation?: boolean; // 为它生成学术引用（档案库显示 OF-…）
}

export interface MockConsent {
  id: string;
  encounterId: string;
  templateType: 'recording' | 'portrait' | 'publication';
  scope: string;
  withdrawn?: boolean;
}

export interface MockMemo {
  id: string;
  type: 'reflexive' | 'analytical' | 'quicknote';
  content: string;
  linkedArtifactIds?: string[];
  themes?: string[];
}

export interface MockInboxFile {
  filename: string;
  content: string;
}

export const mockEvents: MockEvent[] = [
  {
    id: 'evt-demo-kmg-zhuanxin',
    dayOffset: 2,
    date: '2026-09-10',
    cityCode: 'KMG',
    locationName: '昆明篆新农贸市场',
    contextNote: '上午 7–11 点开市，水产区集中在西侧。首次进入，未带介绍人。',
  },
  {
    id: 'evt-demo-kmg-mushuihua',
    dayOffset: 1,
    date: '2026-09-11',
    cityCode: 'KMG',
    locationName: '昆明木水花野生菌交易市场',
    contextNote: '凌晨 3 点夜市尾段，见货尾交易；白天为散户零售。',
  },
  {
    id: 'evt-demo-dl-gucheng',
    dayOffset: 13,
    date: '2026-08-30',
    cityCode: 'DLU',
    locationName: '大理古城北门早市',
    contextNote: '旅游季尾声，摊主构成与雨季前差异明显。',
  },
];

export const mockParticipants: MockParticipant[] = [
  {
    pseudonym: 'P-001',
    industry: '水产摊主',
    region: '云南·昆明',
    referralChain: [],
    consentScope: ['recording', 'publication'],
  },
  {
    pseudonym: 'P-002',
    industry: '野生菌中间商',
    region: '云南·昆明',
    referralChain: ['P-001'], // P-001 介绍的 → 滚雪球抽样第一跳
    consentScope: ['recording', 'portrait', 'publication'],
  },
  {
    pseudonym: 'P-003',
    industry: '餐饮采购',
    region: '云南·昆明',
    referralChain: ['P-001', 'P-002'], // 第二跳
    consentScope: ['recording'],
  },
  {
    pseudonym: 'P-004',
    industry: '菌子零售摊主',
    region: '云南·昆明',
    referralChain: ['P-002'],
    consentScope: ['recording', 'publication'],
  },
  {
    pseudonym: 'P-005',
    industry: '客栈主 / 采购中间人',
    region: '云南·大理',
    referralChain: [],
    consentScope: ['recording', 'publication'],
  },
];

export const mockEncounters: MockEncounter[] = [
  {
    id: 'enc-demo-001',
    eventId: 'evt-demo-kmg-zhuanxin',
    participantRef: 'P-001',
    samplingReason: '便利抽样：市场西侧第一个水产摊位，作为行业入口受访者',
    dayOffset: 2,
  },
  {
    id: 'enc-demo-002',
    eventId: 'evt-demo-kmg-mushuihua',
    participantRef: 'P-002',
    samplingReason: '滚雪球：P-001 引荐，称其"懂全市场的价"',
    dayOffset: 1,
  },
  {
    id: 'enc-demo-003',
    eventId: 'evt-demo-kmg-mushuihua',
    participantRef: 'P-003',
    samplingReason: '目的性抽样：买方视角，核对中间商报价的真实区间',
    dayOffset: 1,
  },
  {
    id: 'enc-demo-004',
    eventId: 'evt-demo-kmg-mushuihua',
    participantRef: 'P-004',
    samplingReason: '滚雪球：P-002 引荐的零售端对照样本',
    dayOffset: 1,
  },
  {
    id: 'enc-demo-005',
    eventId: 'evt-demo-dl-gucheng',
    participantRef: 'P-005',
    samplingReason: '便利抽样：早市常客，跨城对照（旅游消费侧）',
    dayOffset: 13,
  },
];

export const mockArtifacts: MockArtifact[] = [
  {
    id: 'art-demo-audio-001',
    filename: 'P001-水产摊-开市前整理.wav',
    encounterId: 'enc-demo-001',
    eventId: 'evt-demo-kmg-zhuanxin',
    dayOffset: 2,
    content: 'MOCK-WAV-BYTES P001 开市前整理货台录音（演示字节，占位音频内容）',
  },
  {
    id: 'art-demo-photo-001',
    filename: 'zhuanxin-shuichan-01.jpg',
    encounterId: 'enc-demo-001',
    eventId: 'evt-demo-kmg-zhuanxin',
    dayOffset: 2,
    content: 'MOCK-JPEG-BYTES 篆新市场水产区全景（演示占位图片）',
  },
  {
    id: 'art-demo-note-001',
    filename: 'P002-菌价口径-现场笔记.md',
    encounterId: 'enc-demo-002',
    eventId: 'evt-demo-kmg-mushuihua',
    dayOffset: 1,
    content:
      '# 现场笔记：P-002 的报价口径\n\n- 见客三档价：熟人 / 饭店 / 游客，差价可达 40%\n- 「干度折算」是议价核心变量\n- 待核对：P-003 作为买方是否确认同一区间\n',
    makeCitation: true,
  },
  {
    id: 'art-demo-audio-002',
    filename: 'P002-夜市尾段交易.wav',
    encounterId: 'enc-demo-002',
    eventId: 'evt-demo-kmg-mushuihua',
    dayOffset: 1,
    content: 'MOCK-WAV-BYTES P002 夜市尾段交易过程录音（演示字节）',
  },
  {
    id: 'art-demo-note-002',
    filename: 'P004-零售对照.txt',
    encounterId: 'enc-demo-004',
    eventId: 'evt-demo-kmg-mushuihua',
    dayOffset: 1,
    content: 'P-004 零售端报价记录（演示占位文本）。与 P-002 中间商口径差异约 15%。',
  },
  {
    id: 'art-demo-audio-003',
    filename: 'P005-大理早市客栈采购.wav',
    encounterId: 'enc-demo-005',
    eventId: 'evt-demo-dl-gucheng',
    dayOffset: 13,
    content: 'MOCK-WAV-BYTES P005 大理早市采购访谈录音（演示字节）',
  },
];

export const mockConsents: MockConsent[] = [
  { id: 'consent-demo-001', encounterId: 'enc-demo-001', templateType: 'recording', scope: '仅用于学术研究' },
  { id: 'consent-demo-002', encounterId: 'enc-demo-002', templateType: 'recording', scope: '仅用于学术研究' },
  { id: 'consent-demo-003', encounterId: 'enc-demo-002', templateType: 'portrait', scope: '照片可用于论文插图' },
  { id: 'consent-demo-004', encounterId: 'enc-demo-003', templateType: 'recording', scope: '仅用于学术研究' },
  {
    id: 'consent-demo-005',
    encounterId: 'enc-demo-003',
    templateType: 'publication',
    scope: '撤回：受访者要求匿名升级',
    withdrawn: true,
  },
  { id: 'consent-demo-006', encounterId: 'enc-demo-005', templateType: 'recording', scope: '仅用于学术研究' },
];

export const mockMemos: MockMemo[] = [
  {
    id: 'memo-demo-reflexive-001',
    type: 'reflexive',
    content:
      '反身性备忘：我在木水花市场会不自觉用「中间商赚差价」的框架提问。P-002 两次纠正了我对「价」的理解——他报的从来不是单一价格，而是一组关系。警惕：不要把折扣叙事强加给数据。',
    themes: ['反身性', '提问框架'],
  },
  {
    id: 'memo-demo-analytical-001',
    type: 'analytical',
    content:
      '编码草稿（待确认）：「报价的三档结构」初步浮现于 P-002/P-004 两处，P-001 未提及。属于孤证的部分：夜市尾段交易规则仅有 P-002 单一来源，需在下一场田野找第二来源（三角验证缺口）。',
    linkedArtifactIds: ['art-demo-note-001', 'art-demo-note-002'],
    themes: ['报价结构', '三角验证缺口'],
  },
];

/** 投进 inbox/ 的待定文件：载入后出现在「收件箱」，可走一遍确认入库流程 */
export const mockInboxFiles: MockInboxFile[] = [
  {
    filename: 'demo-inbox-P003-采购清单.txt',
    content: 'P-003 提供的日常采购清单（演示占位文本）。木水花：见手青 3kg、干牛肝菌 0.5kg…',
  },
  {
    filename: 'demo-inbox-mushuihua-02.jpg',
    content: 'MOCK-JPEG-BYTES 木水花市场零售区第二张（演示占位图片）',
  },
];

