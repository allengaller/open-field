import type Database from 'better-sqlite3-multiple-ciphers';
import type { Memo } from '@openfield/core';
import { listArtifacts, listEncountersByEvent, listFieldEvents, listMemos } from './repos';

// 研究台：把工作台原始记录（事件/访谈/采集物/备忘录）合成一条可回溯的时间轴，
// 并汇总主题编码。只读服务——研究动作本身（撰写/编码）走 registry 的入链函数。

export interface TimelineRow {
  kind: 'event' | 'encounter' | 'artifact' | 'memo';
  id: string;
  at: number;
  title: string;
  detail: string;
  themes?: string[];
  confirmed?: boolean;
  eventId?: string;
  encounterId?: string;
}

export interface ResearchPayload {
  timeline: TimelineRow[];
  memos: Memo[];
  themeCounts: { theme: string; count: number }[];
  stats: { memos: number; drafts: number; confirmed: number; themes: number };
}

export function buildTimeline(db: Database.Database): TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (const e of listFieldEvents(db)) {
    rows.push({
      kind: 'event',
      id: e.id,
      at: Date.parse(`${e.date}T00:00:00`),
      title: e.locationName,
      detail: `${e.cityCode}${e.contextNote ? ` · ${e.contextNote}` : ''}`,
    });
    const encs = listEncountersByEvent(db, e.id);
    for (const c of encs) {
      rows.push({
        kind: 'encounter',
        id: c.id,
        at: c.startedAt,
        title: `受访者 ${c.participantRef}`,
        detail: c.samplingReason,
        eventId: c.eventId,
      });
    }
  }

  const artifacts = listArtifacts(db);
  const encounterOfArtifact = new Map(artifacts.map((a) => [a.id, a.encounterId]));
  for (const a of artifacts) {
    rows.push({
      kind: 'artifact',
      id: a.id,
      at: a.capturedAt,
      title: a.refId ?? a.id,
      detail: `${a.type} · ${a.mime}`,
      eventId: a.eventId,
      encounterId: a.encounterId,
    });
  }

  for (const m of listMemos(db)) {
    rows.push({
      kind: 'memo',
      id: m.id,
      at: m.createdAt,
      title: m.id,
      detail: m.content.length > 80 ? `${m.content.slice(0, 80)}…` : m.content,
      themes: m.themes,
      confirmed: m.confirmedAt !== null,
      // 备忘录没有直接的访谈字段：经关联采集物反查所属访谈
      encounterId: m.linkedArtifactIds.map((id) => encounterOfArtifact.get(id)).find((enc) => enc !== undefined),
    });
  }

  return rows.sort((a, b) => a.at - b.at);
}

export function loadResearch(db: Database.Database): ResearchPayload {
  const memos = listMemos(db);
  const themeCounts = new Map<string, number>();
  for (const m of memos) {
    for (const t of m.themes ?? []) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
  }
  const drafts = memos.filter((m) => m.confirmedAt === null).length;
  return {
    timeline: buildTimeline(db),
    memos,
    themeCounts: [...themeCounts.entries()]
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme)),
    stats: {
      memos: memos.length,
      drafts,
      confirmed: memos.length - drafts,
      themes: themeCounts.size,
    },
  };
}
