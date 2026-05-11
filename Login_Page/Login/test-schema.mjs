const instance = 'https://dev286774.service-now.com';
const user = 'admin';
const pass = 'p/rLsoR41AV^';
const token = Buffer.from(`${user}:${pass}`).toString('base64');

async function testSchema() {
  const table = 'x_2048396_ngo_vo_1_ngo_projects';
  const url = `${instance}/api/now/table/${table}?sysparm_limit=1`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Basic ${token}`,
        'Accept': 'application/json'
      }
    });
    
    const text = await res.text();
    const json = JSON.parse(text);
    if (json.result && json.result.length > 0) {
      console.log('Fields available:', Object.keys(json.result[0]).filter(k => k.startsWith('u_')));
      console.log('Sample record:', JSON.stringify(json.result[0], null, 2));
    } else {
      console.log('No records found or error:', text);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

testSchema();
