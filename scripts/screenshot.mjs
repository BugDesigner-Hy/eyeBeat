/**
 * 用 Chrome DevTools 协议批量抓图（浏览器自己合成，不经过屏幕录制，因此不会有录屏水印）。
 *
 * 用法：
 *   pnpm dev                     # 另开一个终端，保持运行
 *   node scripts/screenshot.mjs  # 默认输出到 .screenshots/（已 gitignore）
 *
 * 可选环境变量：
 *   SHOT_BASE=http://localhost:5173/   站点地址
 *   SHOT_OUT=.screenshots              输出目录
 *   SHOT_ONLY=01,03                    只抓名字以这些前缀开头的任务
 *   CHROME_PATH="C:\\...\\chrome.exe"  自定义浏览器路径
 *
 * 依赖：本机 Chrome / Edge。Windows 会自动在常见路径里找，其他平台用 CHROME_PATH 指定。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 9345
const BASE = process.env.SHOT_BASE || 'http://localhost:5173/'
const OUT = process.env.SHOT_OUT || '.screenshots'
const ONLY = process.env.SHOT_ONLY || ''

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p))
if (!chromePath) {
  console.error('找不到 Chrome / Edge，请用 CHROME_PATH 指定可执行文件路径')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 页面脚本执行前注入：重置设置 → 写入本任务配置 → 标记已开机。
 * 每个任务从固定状态开始，避免上一个任务的选择残留。
 */
function preset(settings = {}) {
  return `try{
    localStorage.setItem('himusic.settings', ${JSON.stringify(JSON.stringify(settings))});
    // 桌面与 App（手机 / 独立窗口）分开记开机状态，两个都要写
    localStorage.setItem('himusic.booted', '1');
    localStorage.setItem('himusic.booted.app', '1');
  }catch(e){}`
}

// 采集任务：坐标是 CSS 像素（1440x780）。调整界面后需要重新核对。
const jobs = [
  {
    name: '01-wall',
    desc: '封面墙（瀑布流，强调色跟随封面）',
    wait: 16000,
    mouse: [1415, 300],
  },
  {
    name: '02-canvas',
    desc: '封面墙 · 无限画布布局',
    settings: { wallLayout: 'canvas' },
    wait: 16000,
    mouse: [700, 480],
  },
  {
    name: '03-detail',
    desc: '详情页（黑胶 + 歌词 + 评论 + 队列 + 遥测）',
    settings: { coverVinyl: true },
    wait: 16000,
    clicks: [[1100, 250, 5000], [120, 745, 6000], [640, 705, 3500]],
    mouse: [700, 420],
  },
  {
    name: '04-standby',
    desc: '待机屏（CRT 关机 + 七段时钟 + 机器人）',
    wait: 16000,
    keys: ['p'],
    after: 3500,
    mouse: [720, 420],
    after2: 1500,
  },
  {
    name: '05-palette',
    desc: '命令面板',
    wait: 16000,
    keys2: ['ctrl+k'],
    after2: 2500,
    mouse: [700, 330],
  },
  {
    name: '06-fx',
    desc: 'FX / EQ 面板（经命令面板打开）',
    wait: 16000,
    clicks: [[1100, 250, 4500]],
    keys2: ['ctrl+k'],
    after2: 1200,
    keys3: ['type:fx', 'Enter'],
    after3: 3000,
    mouse: [1415, 600],
  },
  {
    name: '07-lyrics',
    desc: '歌词面板与偏移控制',
    wait: 16000,
    clicks: [[1100, 250, 5000]],
    keys2: ['l'],
    after2: 5000,
    mouse: [700, 300],
  },
  {
    name: '08-mobile',
    desc: '移动端封面墙',
    wait: 16000,
    mouse: [200, 700],
    w: 390,
    h: 844,
    mobile: true,
  },
]

function keyParams(spec) {
  const parts = spec.split('+')
  const raw = parts.pop()
  const isLetter = /^[a-z]$/i.test(raw)
  const vk = isLetter ? raw.toUpperCase().charCodeAt(0) : raw === ' ' ? 32 : 0
  return {
    type: 'keyDown',
    key: isLetter ? raw.toLowerCase() : raw,
    code: isLetter ? `Key${raw.toUpperCase()}` : raw === ' ' ? 'Space' : raw,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    modifiers: (parts.includes('ctrl') ? 2 : 0) | (parts.includes('shift') ? 8 : 0),
  }
}

async function openTarget() {
  const created = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
  const target = await created.json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  const pending = new Map()
  let seq = 0
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    const entry = msg.id && pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { target, ws, send, close: () => ws.close() }
}

async function pressKey(send, spec) {
  if (spec.startsWith('type:')) {
    await send('Input.insertText', { text: spec.slice(5) })
    return
  }
  const p = keyParams(spec)
  await send('Input.dispatchKeyEvent', p)
  await send('Input.dispatchKeyEvent', { ...p, type: 'keyUp' })
}

async function click(send, [x, y]) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

async function shoot(job) {
  const w = job.w || 1440
  const h = job.h || 780
  const { target, send, close } = await openTarget()
  try {
    await send('Page.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: preset(job.settings) })

    if (job.mobile) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true })
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
      await send('Emulation.setUserAgentOverride', {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      })
    } else {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false })
    }

    await send('Page.navigate', { url: BASE })
    await sleep(job.wait || 15000)

    for (const k of job.keys || []) { await pressKey(send, k); await sleep(600) }
    if (job.after) await sleep(job.after)

    for (const c of job.clicks || []) { await click(send, c); await sleep(c[2] || 2500) }

    for (const k of job.keys2 || []) { await pressKey(send, k); await sleep(400) }
    if (job.after2) await sleep(job.after2)

    for (const k of job.keys3 || []) { await pressKey(send, k); await sleep(500) }
    if (job.after3) await sleep(job.after3)

    if (job.mouse) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: job.mouse[0], y: job.mouse[1] })
      await sleep(1200)
    }

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.mkdirSync(OUT, { recursive: true })
    const file = path.join(OUT, `${job.name}.png`)
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
    console.log(`✓ ${job.name}  ${job.desc}  ${Math.round(fs.statSync(file).size / 1024)}KB`)
  } finally {
    close()
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {})
  }
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-shot-'))
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ], { stdio: 'ignore' })

  try {
    let ready = false
    for (let i = 0; i < 80; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/json/version`); ready = true; break } catch { await sleep(300) }
    }
    if (!ready) throw new Error(`Chrome 调试端口 ${PORT} 未就绪`)

    const picked = jobs.filter((j) => !ONLY || ONLY.split(',').some((n) => j.name.startsWith(n)))
    for (const job of picked) await shoot(job)
    console.log(`\n输出目录：${path.resolve(OUT)}`)
    console.log('提示：PNG 体积较大，README 用图请再压成 webp。')
  } finally {
    chrome.kill()
    await sleep(400)
    // 浏览器进程可能仍占用临时目录，清理失败不影响结果
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch {}
  }
}

main().catch((e) => { console.error('抓图失败：', e.message); process.exit(1) })
