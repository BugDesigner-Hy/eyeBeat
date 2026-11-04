/** 画布模式相机 API：供准星把目标曲目平移进视口 */

export interface EnsureVisibleResult {
  /** 动画结束（或即时落位）后 resolve；无该曲则为 false */
  done: Promise<boolean>
  /** 镜头位移量：封面屏幕坐标将同向移动，准星可并行飞向终点 */
  shiftX: number
  shiftY: number
}

export interface CoverCanvasCamera {
  ensureVisible(trackId: string): EnsureVisibleResult | null
}

let api: CoverCanvasCamera | null = null

export function registerCoverCanvasCamera(next: CoverCanvasCamera | null) {
  api = next
}

export function coverCanvasCamera() {
  return api
}
