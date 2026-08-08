const fs = require('node:fs')
const path = require('node:path')

const WINDOWS_RUNTIME_FILES = [
  'LICENSES.chromium.html',
  'dxcompiler.dll',
  'dxil.dll',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
  'vulkan-1.dll',
]

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  for (const file of WINDOWS_RUNTIME_FILES) {
    fs.rmSync(path.join(context.appOutDir, file), { force: true })
  }
}
