const BASE_URL = process.env.CHECK_BASE_URL || 'http://127.0.0.1:8000';
const RUN_MUTATION_TEST = String(process.env.RUN_MUTATION_TEST || '').toLowerCase() === 'true';

const ACCOUNTS = {
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@test.com',
    password: process.env.ADMIN_PASSWORD || '123456'
  },
  renter: {
    email: process.env.RENTER_EMAIL || 'renter@test.com',
    password: process.env.RENTER_PASSWORD || '123456'
  },
  owner: {
    email: process.env.OWNER_EMAIL || 'owner.car@test.com',
    password: process.env.OWNER_PASSWORD || '123456'
  }
};

const report = [];

function log(status, name, detail = '') {
  const line = `[${status}] ${name}${detail ? ` - ${detail}` : ''}`;
  report.push({ status, name, detail });
  console.log(line);
}

async function parseResponse(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return data;
}

async function http({ method = 'GET', path, token, body, expected = [200] }) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await parseResponse(res);

  if (!expected.includes(res.status)) {
    throw new Error(`${path} status=${res.status} body=${JSON.stringify(data)}`);
  }

  return { status: res.status, data };
}

function extractToken(payload = {}) {
  return payload?.token || payload?.data?.token || payload?.access_token || '';
}

function pickArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.vehicles)) return value.vehicles;
  if (Array.isArray(value?.rentals)) return value.rentals;
  return [];
}

async function tryPaths(name, optionsList) {
  let lastErr = null;
  for (const options of optionsList) {
    try {
      const result = await http(options);
      log('PASS', `${name} ${options.path}`, `status=${result.status}`);
      return result;
    } catch (error) {
      lastErr = error;
    }
  }
  throw lastErr || new Error(`${name} failed with all paths`);
}

async function login(label, credentials) {
  const result = await tryPaths(`login:${label}`, [
    {
      method: 'POST',
      path: '/api/users/login',
      body: credentials,
      expected: [200]
    },
    {
      method: 'POST',
      path: '/api/auth/login',
      body: credentials,
      expected: [200]
    }
  ]);
  const token = extractToken(result.data);
  if (!token) {
    throw new Error(`login:${label} missing token`);
  }
  return token;
}

async function runMutationFlow(renterToken) {
  const vehiclesRes = await tryPaths('vehicles for mutation', [
    { method: 'GET', path: '/api/vehicles/available/list?page=1&limit=20', expected: [200] }
  ]);
  const vehicles = pickArray(vehiclesRes.data);
  const target = vehicles.find((item) => item?._id);
  if (!target) {
    throw new Error('No available vehicle found for mutation test');
  }

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() + 2);
  const end = new Date(now);
  end.setDate(end.getDate() + 3);
  const dateOnly = (d) => d.toISOString().slice(0, 10);

  const rentalPayload = {
    vehicle_id: target._id,
    start_date: dateOnly(start),
    end_date: dateOnly(end),
    note: 'RUN_MUTATION_TEST from final-system-check'
  };

  await tryPaths('create rental request', [
    {
      method: 'POST',
      path: '/api/rentals/request',
      token: renterToken,
      body: rentalPayload,
      expected: [200, 201]
    }
  ]);
}

async function run() {
  try {
    await tryPaths('health', [{ method: 'GET', path: '/health', expected: [200] }]);

    const adminToken = await login('admin', ACCOUNTS.admin);
    const renterToken = await login('renter', ACCOUNTS.renter);
    const ownerToken = await login('owner', ACCOUNTS.owner);

    await tryPaths('vehicles:list', [
      { method: 'GET', path: '/api/vehicles/available/list?page=1&limit=12', expected: [200] }
    ]);

    await tryPaths('admin:dashboard', [
      { method: 'GET', path: '/api/admin/dashboard', token: adminToken, expected: [200] }
    ]);
    await tryPaths('admin:users', [
      { method: 'GET', path: '/api/admin/users', token: adminToken, expected: [200] }
    ]);
    await tryPaths('admin:vehicles', [
      { method: 'GET', path: '/api/admin/vehicles', token: adminToken, expected: [200] }
    ]);
    await tryPaths('admin:rentals', [
      { method: 'GET', path: '/api/admin/rentals', token: adminToken, expected: [200] }
    ]);
    await tryPaths('admin:contracts', [
      { method: 'GET', path: '/api/admin/contracts', token: adminToken, expected: [200] }
    ]);
    await tryPaths('admin:payments', [
      { method: 'GET', path: '/api/admin/payments', token: adminToken, expected: [200] }
    ]);
    await tryPaths('admin:owner-applications', [
      { method: 'GET', path: '/api/admin/owner-applications', token: adminToken, expected: [200] }
    ]);

    await tryPaths('renter:my-requests', [
      { method: 'GET', path: '/api/rentals/my-requests', token: renterToken, expected: [200] },
      { method: 'GET', path: '/api/rentals/renter/my-rentals', token: renterToken, expected: [200] }
    ]);

    await tryPaths('owner:requests', [
      { method: 'GET', path: '/api/rentals/owner-requests', token: ownerToken, expected: [200] },
      { method: 'GET', path: '/api/rentals/owner/my-rentals', token: ownerToken, expected: [200] }
    ]);

    if (RUN_MUTATION_TEST) {
      await runMutationFlow(renterToken);
    } else {
      log('PASS', 'mutation flow', 'skipped (RUN_MUTATION_TEST=false)');
    }

    const failCount = report.filter((item) => item.status === 'FAIL').length;
    log('PASS', 'summary', `pass=${report.length - failCount}, fail=${failCount}`);
  } catch (error) {
    log('FAIL', 'final-system-check', error.message);
    process.exit(1);
  }
}

run();
