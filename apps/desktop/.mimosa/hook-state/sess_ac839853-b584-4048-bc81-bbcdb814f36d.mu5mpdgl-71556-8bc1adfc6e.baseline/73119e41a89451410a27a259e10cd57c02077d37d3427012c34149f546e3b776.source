export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const IPC_CHANNELS = [
  'vault:create',
  'vault:open',
  'vault:status',
  'events:create',
  'encounters:create',
  'inbox:scan',
  'inbox:list',
  'inbox:confirm',
  'inbox:reject',
  'verify:run',
  'citation:make',
  'purge:subject',
  'backup:export',
  'archive:events',
  'archive:encounters',
  'archive:artifacts',
  'archive:detail',
  'evidence:list',
  'memos:confirm',
  'journals:build',
  'participants:upsert',
  'participants:set-real-name',
  'consents:record',
  'consents:withdraw',
  'time:sync',
  'mock:load',
  'mock:clear',
  'mock:status',
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];
