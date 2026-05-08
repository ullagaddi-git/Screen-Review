#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const { execFileSync } = require('node:child_process')
const os = require('node:os')

const VERSION = 'v1.8.4'
const ASSET = 'whisper-blas-bin-x64.zip'
const URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${VERSION}/${ASSET}`

const OUT_DIR = path.resolve(__dirname, '..', 'resources', 'whisper', 'bin')
const SENTINEL = path.join(OUT_DIR, '.version')
const ZIP_TMP = path.join(os.tmpdir(), `screenshpeak-${ASSET}`)
const EXTRACT_TMP = path.join(os.tmpdir(), 'screenshpeak-whisper-extract')

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
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        res.resume()
        return
      }

      const total = Number(res.headers['content-length']) || 0
      let received = 0
      let lastLog = 0

      const out = fs.createWriteStream(ZIP_TMP)
      res.on('data', (chunk) => {
        received += chunk.length
        const now = Date.now()
        if (total > 0 && now - lastLog > 1000) {
          const pct = ((received / total) * 100).toFixed(1)
          process.stderr.write(
            `\r[whisper-bin] ${pct}%  (${bytesToMB(received)} / ${bytesToMB(total)} MB)`
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
    req.setTimeout(60_000, () => req.destroy(new Error('Download timed out')))
  })
}

function expandZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`
    ],
    { stdio: 'inherit' }
  )
}

function findFiles(rootDir, predicate) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (predicate(entry.name, p)) out.push(p)
    }
  }
  walk(rootDir)
  return out
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[whisper-bin] Skipping — not on Windows.')
    return
  }

  if (fs.existsSync(SENTINEL)) {
    const installedVersion = fs.readFileSync(SENTINEL, 'utf8').trim()
    if (installedVersion === VERSION) {
      console.log(`[whisper-bin] whisper.cpp ${VERSION} already installed at ${OUT_DIR} — skipping.`)
      return
    }
    console.log(`[whisper-bin] Found ${installedVersion}, upgrading to ${VERSION}.`)
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log(`[whisper-bin] Downloading whisper.cpp ${VERSION} (${ASSET})…`)
  console.log(`[whisper-bin] URL: ${URL}`)
  await download(URL)

  console.log(`[whisper-bin] Extracting…`)
  fs.rmSync(EXTRACT_TMP, { recursive: true, force: true })
  expandZip(ZIP_TMP, EXTRACT_TMP)

  // Only copy the files we actually need at runtime — keeps installer size small.
  const KEEP = new Set([
    'whisper-cli.exe',
    'whisper.dll',
    'ggml.dll',
    'ggml-base.dll',
    'ggml-blas.dll',
    'ggml-cpu.dll',
    'libopenblas.dll'
  ])

  const wanted = findFiles(EXTRACT_TMP, (name) => KEEP.has(name.toLowerCase()))
  if (wanted.length === 0) {
    throw new Error(`No expected .exe / .dll files found in extracted archive at ${EXTRACT_TMP}`)
  }

  for (const src of wanted) {
    const dest = path.join(OUT_DIR, path.basename(src))
    fs.copyFileSync(src, dest)
  }

  const missing = [...KEEP].filter((f) => !fs.existsSync(path.join(OUT_DIR, f)))
  if (missing.length > 0) {
    throw new Error(`Missing expected files after extract: ${missing.join(', ')}`)
  }

  fs.writeFileSync(SENTINEL, VERSION + '\n')
  fs.rmSync(ZIP_TMP, { force: true })
  fs.rmSync(EXTRACT_TMP, { recursive: true, force: true })

  const installed = fs.readdirSync(OUT_DIR).filter((f) => f !== '.version')
  console.log(`[whisper-bin] Installed ${installed.length} files at ${OUT_DIR}:`)
  for (const f of installed) console.log(`  - ${f}`)
}

main().catch((err) => {
  console.error(`[whisper-bin] Failed: ${err.message}`)
  console.error(`[whisper-bin] You can rerun manually: node scripts/download-whisper-binary.js`)
  process.exit(1)
})
