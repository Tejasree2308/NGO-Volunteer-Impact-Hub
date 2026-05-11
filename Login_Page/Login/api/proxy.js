// Vercel serverless proxy — receives all /api/now/* requests via vercel.json rewrite
// The rewrite injects ?snpath=<table/path> and preserves original query params.
export default async function handler(req, res) {
  const snInstance = process.env.VITE_SN_INSTANCE || 'https://dev286774.service-now.com'
  const snUsername = process.env.VITE_SN_USERNAME || 'admin'
  const snPassword = process.env.VITE_SN_PASSWORD || 'p/rLsoR41AV^'

  // snpath = 'table/x_2048396_ngo_vo_1_ngo_projects'
  // remaining queryParams = { sysparm_limit, sysparm_fields, sysparm_query, ... }
  const { snpath, ...queryParams } = req.query
  const qs = new URLSearchParams(queryParams).toString()
  const snUrl = `${snInstance}/api/now/${snpath}${qs ? '?' + qs : ''}`

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
