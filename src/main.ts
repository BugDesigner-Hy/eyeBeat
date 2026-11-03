import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/silkscreen'
import '@fontsource/vt323'
import './styles/main.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
