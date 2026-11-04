import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/silkscreen'
import '@fontsource/vt323'
import './styles/main.css'
import { bindDocumentLang } from './i18n'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
bindDocumentLang()
app.mount('#app')
