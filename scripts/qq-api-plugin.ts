import { createRequire } from 'node:module'
import path from 'node:path'
import { localApi } from './api-service.ts'

interface Options {
  /** 前端访问的路径前缀，需与 VITE_QQ_API_BASE 一致 */
  prefix: string
  port: number
}

/**
 * 开发 / 预览时拉起 @yakult-green-tea/qq-music-api（Koa 服务）。
 * 设备身份与会话写在 API 服务的工作目录下（.auth-state，已 gitignore）。
 */
export function qqApi({ prefix, port }: Options) {
  return localApi({
    name: 'himusic:qq-api',
    prefix,
    port,
    tag: '[qq]',
    entry: () => {
      // 该包的 exports 不暴露深层路径，先定位 package.json 再拼入口
      const pkg = createRequire(import.meta.url).resolve('@yakult-green-tea/qq-music-api/package.json')
      return path.join(path.dirname(pkg), 'dist', 'src', 'app.js')
    },
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn' },
  })
}
