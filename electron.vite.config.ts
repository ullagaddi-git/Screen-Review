import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts'),
          recorder: resolve(__dirname, 'src/main/recorder-preload.ts'),
          indicator: resolve(__dirname, 'src/main/indicator-preload.ts'),
          picker: resolve(__dirname, 'src/main/picker-preload.ts'),
          region: resolve(__dirname, 'src/main/region-preload.ts'),
          result: resolve(__dirname, 'src/main/result-preload.ts'),
          transcript: resolve(__dirname, 'src/main/transcript-preload.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          settings: resolve(__dirname, 'src/renderer/index.html'),
          recorder: resolve(__dirname, 'src/renderer/windows/recorder/recorder.html'),
          'mic-indicator': resolve(__dirname, 'src/renderer/windows/result/mic-indicator.html'),
          'mode-picker': resolve(__dirname, 'src/renderer/windows/picker/mode-picker.html'),
          'region-overlay': resolve(__dirname, 'src/renderer/windows/picker/region-overlay.html'),
          'result-panel': resolve(__dirname, 'src/renderer/windows/result/result-panel.html'),
          'live-transcript': resolve(__dirname, 'src/renderer/windows/transcript/live-transcript.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    },
    plugins: [react()]
  }
})
