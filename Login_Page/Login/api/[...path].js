// Vercel serverless proxy — forwards all /api/* requests → ServiceNow PDI
// Handles GET, POST, PATCH, DELETE with Basic Auth injected server-side.
export default async function handler(req, res) {
  const snInstance = process.env.VITE_SN_INSTANCE
  const snUsername = process.env.VITE_SN_USERNAME
  const snPassword = process.env.VITE_SN_PASSWORD

  if (!snInstance || !snUsername || !snPassword) {
    return res.status(500).json({ error: 'Server misconfiguration: ServiceNow environment variables are not set.' })
  }

  // path = ['now', 'table', 'x_2048396_...'] → 'now/table/x_2048396_...'
  const { path, ...queryParams } = req.query
  const snPath = Array.isArray(path) ? path.join('/') : (path || '')
  const qs = new URLSearchParams(queryParams).toString()
  const snUrl = `${snInstance}/api/${snPath}${qs ? '?' + qs : ''}`

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
