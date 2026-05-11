const instance = 'https://dev286774.service-now.com';
const user = 'admin';
const pass = 'p/rLsoR41AV^';
const token = Buffer.from(`${user}:${pass}`).toString('base64');

async function testFetch() {
  const table = 'x_2048396_ngo_vo_1_ngo_projects';
  const fields = 'sys_id,short_description,description,location,expected_start,due_date,state,number,opened_at,u_project_name,u_description,u_location,u_start_date,u_end_date,u_required_skills,u_status,u_volunteers_needed';
  const url = `${instance}/api/now/table/${table}?sysparm_fields=${fields}&sysparm_limit=5`;
  
  console.log('Fetching:', url);
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Basic ${token}`,
        'Accept': 'application/json'
      }
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

testFetch();
