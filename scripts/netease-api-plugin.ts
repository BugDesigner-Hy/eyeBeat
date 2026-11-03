import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'
import type { Plugin, ProxyOptions } from 'vite'

interface Options {
  /** 前端访问的路径前缀，需与 VITE_NETEASE_API_BASE 一致 */
  prefix: string
  port: number
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
 * 开发 / 预览时在子进程里启动 NeteaseCloudMusicApiEnhanced，并把 prefix 代理过去。
 * 端口已被占用时视为服务已在运行，直接复用。
 */
export function neteaseApi({ prefix, port }: Options): Plugin {
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
    const entry = createRequire(import.meta.url).resolve('@neteasecloudmusicapienhanced/api/app.js')
    child = spawn(process.execPath, [entry], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const forward = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) log(`[ncm] ${line}`)
    }
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)
    child.on('exit', (code) => {
      if (code) log(`[ncm] exited with code ${code}`)
      child = undefined
    })
  }

  const stop = () => {
    child?.kill()
    child = undefined
  }
  process.once('exit', stop)

  return {
    name: 'himusic:netease-api',
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
