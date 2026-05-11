// Vercel serverless proxy — forwards /api/now/* → ServiceNow PDI with Basic Auth
// This replaces the Vite dev proxy for production deployments.
export default async function handler(req, res) {
  const snInstance = process.env.VITE_SN_INSTANCE || 'https://dev286774.service-now.com'
  const snUsername = process.env.VITE_SN_USERNAME || 'admin'
  const snPassword = process.env.VITE_SN_PASSWORD || ''

  // Build the ServiceNow URL: path segments + query string
  const { path, ...queryParams } = req.query
  const snPath = Array.isArray(path) ? path.join('/') : (path || '')
  const qs = new URLSearchParams(queryParams).toString()
  const snUrl = `${snInstance}/api/now/${snPath}${qs ? '?' + qs : ''}`

  const credentials = Buffer.from(`${snUsername}:${snPassword}`).toString('base64')

  const fetchOptions = {
    method: req.method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }

  if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.body) {
    fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }

  try {
    const snRes = await fetch(snUrl, fetchOptions)
    const text = await snRes.text()
    res.status(snRes.status).setHeader('Content-Type', 'application/json').end(text)
  } catch (err) {
    res.status(502).json({ error: 'ServiceNow proxy error', detail: err.message })
  }
}
