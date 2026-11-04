import { readonly, ref } from 'vue'

/** 详情页评论区独占第三栏的宽度 */
const query = window.matchMedia('(min-width: 1440px)')
const wide = ref(query.matches)
query.addEventListener('change', (e) => (wide.value = e.matches))

export function useWide() {
  return readonly(wide)
}
