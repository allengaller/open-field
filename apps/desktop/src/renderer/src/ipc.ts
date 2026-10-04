/* renderer 侧 IPC 封装：invoke 带读出行/toast 的显式报错，invokeQuiet 用于锁定态轮询。
   返回形状经 shared/schemas 运行时校验（A31），漂移在 renderer 侧即刻暴露。 */
import type { IpcChannel, IpcResult } from '../../shared/ipc';
import { IPC_RESPONSE_SCHEMAS } from '../../shared/schemas';
import { setReadout, toast } from './ui';

export async function invoke<T>(channel: IpcChannel, payload?: unknown): Promise<T> {
  const res = (await window.openfield.invoke(channel, payload)) as IpcResult<unknown>;
  if (!res.ok) {
    setReadout(`错误：${res.error}`, 'is-error');
    toast(res.error);
    throw new Error(res.error);
  }
  return IPC_RESPONSE_SCHEMAS[channel].parse(res.data) as T;
}

/* 静默版：锁定态下轮询类查询失败时不打扰（读出行与 toast 都不出）；schema 失配同错误路径静默降级 */
export async function invokeQuiet<T>(channel: IpcChannel, payload?: unknown): Promise<T | null> {
  const res = (await window.openfield.invoke(channel, payload)) as IpcResult<unknown>;
  if (!res.ok) return null;
  const parsed = IPC_RESPONSE_SCHEMAS[channel].safeParse(res.data);
  return parsed.success ? (parsed.data as T) : null;
}
