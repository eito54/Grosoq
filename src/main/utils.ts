import http from 'http'
import https from 'https'
import { URL } from 'url'

export function makeHttpRequest(url: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const httpModule = urlObj.protocol === 'https:' ? https : http

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }

    const req = httpModule.request(requestOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          resolve(result)
        } catch (error) {
          resolve({ success: false, error: `Invalid JSON response: ${data}` })
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

export function compareVersions(version1: string, version2: string): number {
  const v1parts = version1.split('.').map(Number)
  const v2parts = version2.split('.').map(Number)
  
  const maxLength = Math.max(v1parts.length, v2parts.length)
  while (v1parts.length < maxLength) v1parts.push(0)
  while (v2parts.length < maxLength) v2parts.push(0)
  
  for (let i = 0; i < maxLength; i++) {
    if (v1parts[i] < v2parts[i]) return -1
    if (v1parts[i] > v2parts[i]) return 1
  }
  return 0
}
