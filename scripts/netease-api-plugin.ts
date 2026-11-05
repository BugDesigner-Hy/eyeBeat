import { createRequire } from 'node:module'
import { localApi } from './api-service.ts'

interface Options {
  /** 前端访问的路径前缀，需与 VITE_NETEASE_API_BASE 一致 */
  prefix: string
  port: number
}

/**
 * 开发 / 预览时在子进程里启动 NeteaseCloudMusicApiEnhanced，并把 prefix 代理过去。
 * 端口已被占用时视为服务已在运行，直接复用。
 */
export function neteaseApi({ prefix, port }: Options) {
  return localApi({
    name: 'himusic:netease-api',
    prefix,
    port,
    tag: '[ncm]',
    entry: () => createRequire(import.meta.url).resolve('@neteasecloudmusicapienhanced/api/app.js'),
  })
}
