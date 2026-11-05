import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import type { Plugin, ProxyOptions } from 'vite'

export interface LocalApiOptions {
  /** 插件名，出现在 vite 插件列表里 */
  name: string
  /** 前端访问的路径前缀，需与 VITE_*_API_BASE 一致，例如 /ncm、/qq */
  prefix: string
  /** 子进程监听端口 */
  port: number
  /** 日志前缀，例如 [ncm]、[qq] */
  tag: string
  /** 返回子进程入口的绝对路径（延迟到启动时才解析，避免未安装依赖时拖垮 vite 启动） */
  entry: () => string
  /** 追加给子进程的环境变量 */
  env?: Record<string, string>
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

/**
 * 开发 / 预览时在子进程里拉起一个本地 API 服务，并把 prefix 代理过去。
 * 端口已被占用时视为服务已在运行，直接复用（方便自己另开窗口调接口）。
 */
export function localApi({ name, prefix, port, tag, entry, env = {} }: LocalApiOptions): Plugin {
  let child: ChildProcess | undefined

  const proxy: Record<string, ProxyOptions> = {
    [prefix]: {
      target: `http://127.0.0.1:${port}`,
      changeOrigin: true,
      rewrite: (path) => path.slice(prefix.length) || '/',
    },
  }

  async function start(log: (msg: string) => void) {
    if (child || (await portInUse(port))) return
    let file: string
    try {
      file = entry()
    } catch {
      log(`${tag} 未安装对应的 API 依赖，跳过启动`)
      return
    }
    child = spawn(process.execPath, [file], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const forward = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) log(`${tag} ${line}`)
    }
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)
    child.on('exit', (code) => {
      if (code) log(`${tag} exited with code ${code}`)
      child = undefined
    })
  }

  const stop = () => {
    child?.kill()
    child = undefined
  }

  process.once('exit', stop)

  return {
    name,
    config: () => ({ server: { proxy }, preview: { proxy } }),
    configureServer(server) {
      void start((msg) => server.config.logger.info(msg))
      server.httpServer?.once('close', stop)
    },
    configurePreviewServer(server) {
      void start((msg) => server.config.logger.info(msg))
      server.httpServer?.once('close', stop)
    },
  }
}
