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
  console.log(`Comparing versions: "${version1}" vs "${version2}"`)
  const cleanV1 = (version1 || '').replace(/^v/, '')
  const cleanV2 = (version2 || '').replace(/^v/, '')
  const v1parts = cleanV1.split('.').map(v => parseInt(v, 10))
  const v2parts = cleanV2.split('.').map(v => parseInt(v, 10))
  
  const maxLength = Math.max(v1parts.length, v2parts.length)
  while (v1parts.length < maxLength) v1parts.push(0)
  while (v2parts.length < maxLength) v2parts.push(0)
  
  for (let i = 0; i < maxLength; i++) {
    const p1 = isNaN(v1parts[i]) ? 0 : v1parts[i]
    const p2 = isNaN(v2parts[i]) ? 0 : v2parts[i]
    if (p1 < p2) return -1
    if (p1 > p2) return 1
  }
  return 0
}
