const instance = 'https://dev286774.service-now.com';
const user = 'admin';
const pass = 'p/rLsoR41AV^';
const token = Buffer.from(`${user}:${pass}`).toString('base64');

async function testPostInvalidField() {
  const table = 'x_2048396_ngo_vo_1_ngo_projects';
  const url = `${instance}/api/now/table/${table}`;
  const payload = {
    short_description: 'Test Project 3',
    u_invalid_field_123: 'This field does not exist',
    u_project_name: 'This also does not exist'
  };
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log('Status:', res.status, res.statusText);
    const text = await res.text();
    if (!res.ok) {
      console.error('Error:', text);
    } else {
      console.log('Data:', text.substring(0, 300));
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

testPostInvalidField();
