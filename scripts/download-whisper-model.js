#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')

const MODEL_NAME = process.env.WHISPER_MODEL || 'base'
const VALID_MODELS = ['tiny', 'base', 'small']

if (!VALID_MODELS.includes(MODEL_NAME)) {
  console.error(`[whisper-model] Invalid model "${MODEL_NAME}". Valid: ${VALID_MODELS.join(', ')}`)
  process.exit(1)
}

const FILENAME = `ggml-${MODEL_NAME}.bin`
const URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${FILENAME}`
const OUT_DIR = path.resolve(__dirname, '..', 'resources', 'whisper')
const OUT_PATH = path.join(OUT_DIR, FILENAME)
const TMP_PATH = OUT_PATH + '.partial'

function bytesToMB(b) {
  return (b / 1024 / 1024).toFixed(1)
}

function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) {
      reject(new Error('Too many redirects'))
      return
    }

    const req = https.get(url, { headers: { 'User-Agent': 'screenshpeak-installer' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        download(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject)
        return
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`))
        res.resume()
        return
      }

      const total = Number(res.headers['content-length']) || 0
      let received = 0
      let lastLog = 0

      const out = fs.createWriteStream(TMP_PATH)
      res.on('data', (chunk) => {
        received += chunk.length
        const now = Date.now()
        if (total > 0 && now - lastLog > 1000) {
          const pct = ((received / total) * 100).toFixed(1)
          process.stderr.write(
            `\r[whisper-model] ${MODEL_NAME}: ${pct}%  (${bytesToMB(received)} / ${bytesToMB(total)} MB)`
          )
          lastLog = now
        }
      })

      res.pipe(out)
      out.on('finish', () => {
        out.close((err) => {
          if (err) reject(err)
          else {
            process.stderr.write('\n')
            resolve(received)
          }
        })
      })
      out.on('error', reject)
    })

    req.on('error', reject)
    req.setTimeout(60_000, () => {
      req.destroy(new Error('Download timed out after 60 seconds of inactivity'))
    })
  })
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  if (fs.existsSync(OUT_PATH)) {
    const stat = fs.statSync(OUT_PATH)
    if (stat.size > 1_000_000) {
      console.log(`[whisper-model] ${FILENAME} already present (${bytesToMB(stat.size)} MB) — skipping download.`)
      return
    }
    console.log(`[whisper-model] ${FILENAME} exists but looks incomplete (${stat.size} bytes) — re-downloading.`)
    fs.unlinkSync(OUT_PATH)
  }

  if (fs.existsSync(TMP_PATH)) fs.unlinkSync(TMP_PATH)

  console.log(`[whisper-model] Downloading ${FILENAME} from Hugging Face…`)
  console.log(`[whisper-model] URL: ${URL}`)
  console.log(`[whisper-model] To:  ${OUT_PATH}`)

  try {
    const bytes = await download(URL)
    fs.renameSync(TMP_PATH, OUT_PATH)
    console.log(`[whisper-model] Downloaded ${bytesToMB(bytes)} MB → ${OUT_PATH}`)
  } catch (err) {
    if (fs.existsSync(TMP_PATH)) fs.unlinkSync(TMP_PATH)
    console.error(`[whisper-model] Download failed: ${err.message}`)
    console.error(`[whisper-model] You can rerun manually: node scripts/download-whisper-model.js`)
    process.exit(1)
  }
}

main()
