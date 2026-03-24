import { Buffer } from 'node:buffer'

function encodeCookieValue(value) {
  return encodeURIComponent(value)
}

export function json(response, statusCode, body) {
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

export function noContent(response) {
  response.statusCode = 204
  response.end()
}

export function redirect(response, location) {
  response.statusCode = 302
  response.setHeader('location', location)
  response.end()
}

export function parseCookies(request) {
  const cookieHeader = request.headers.cookie

  if (!cookieHeader) {
    return {}
  }

  return cookieHeader.split(';').reduce((cookies, entry) => {
    const separatorIndex = entry.indexOf('=')

    if (separatorIndex === -1) {
      return cookies
    }

    const name = entry.slice(0, separatorIndex).trim()
    const value = entry.slice(separatorIndex + 1).trim()

    if (!name) {
      return cookies
    }

    cookies[name] = decodeURIComponent(value)
    return cookies
  }, {})
}

export function appendHeader(response, name, value) {
  const existingValue =
    typeof response.getHeader === 'function' ? response.getHeader(name) : undefined

  if (typeof existingValue === 'undefined') {
    response.setHeader(name, value)
    return
  }

  if (Array.isArray(existingValue)) {
    response.setHeader(name, [...existingValue, value])
    return
  }

  response.setHeader(name, [existingValue, value])
}

export function setCookie(response, name, value, options = {}) {
  const cookieParts = [`${name}=${encodeCookieValue(value)}`]

  cookieParts.push(`Path=${options.path ?? '/'}`)

  if (typeof options.maxAge === 'number') {
    cookieParts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  }

  if (options.httpOnly !== false) {
    cookieParts.push('HttpOnly')
  }

  if (options.sameSite) {
    cookieParts.push(`SameSite=${options.sameSite}`)
  }

  if (options.secure) {
    cookieParts.push('Secure')
  }

  appendHeader(response, 'set-cookie', cookieParts.join('; '))
}

export function clearCookie(response, name, options = {}) {
  setCookie(response, name, '', {
    ...options,
    maxAge: 0,
  })
}

export async function readJsonBody(request) {
  if (typeof request.body === 'string') {
    return request.body.length > 0 ? JSON.parse(request.body) : null
  }

  if (
    request.body &&
    typeof request.body === 'object' &&
    typeof request.body.pipe === 'function'
  ) {
    const chunks = []

    for await (const chunk of request.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    }

    const rawBody = Buffer.concat(chunks).toString('utf8')
    return rawBody.length > 0 ? JSON.parse(rawBody) : null
  }

  if (typeof request[Symbol.asyncIterator] === 'function') {
    const chunks = []

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    }

    const rawBody = Buffer.concat(chunks).toString('utf8')
    return rawBody.length > 0 ? JSON.parse(rawBody) : null
  }

  return null
}

export function setCorsHeaders(response, config) {
  response.setHeader('access-control-allow-credentials', 'true')
  response.setHeader('access-control-allow-headers', 'Content-Type')
  response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
  response.setHeader('access-control-allow-origin', config.frontendOrigin)
  response.setHeader('vary', 'Origin')
}

export function buildFrontendRedirect(frontendAppUrl, fragmentParams) {
  const redirectUrl = new URL(frontendAppUrl)

  redirectUrl.hash = new URLSearchParams(fragmentParams).toString()

  return redirectUrl.toString()
}
