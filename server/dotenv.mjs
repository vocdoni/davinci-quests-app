import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

export function loadDotEnvFiles(
  cwd = process.cwd(),
  filenames = ['.env', '.env.local'],
) {
  for (const filename of filenames) {
    const filepath = resolve(cwd, filename)

    if (!existsSync(filepath)) {
      continue
    }

    const fileContents = readFileSync(filepath, 'utf8')
    const lines = fileContents.split(/\r?\n/)

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue
      }

      const separatorIndex = trimmedLine.indexOf('=')

      if (separatorIndex === -1) {
        continue
      }

      const key = trimmedLine.slice(0, separatorIndex).trim()
      const value = stripWrappingQuotes(
        trimmedLine.slice(separatorIndex + 1).trim(),
      )

      if (!key || key in process.env) {
        continue
      }

      process.env[key] = value
    }
  }
}
