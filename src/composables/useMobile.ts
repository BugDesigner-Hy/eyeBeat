import { readonly, ref } from 'vue'

/** 与 CSS 断点 @media (max-width: 640px) 保持一致 */
const query = window.matchMedia('(max-width: 640px)')
const mobile = ref(query.matches)
query.addEventListener('change', (e) => (mobile.value = e.matches))

export function useMobile() {
  return readonly(mobile)
}
