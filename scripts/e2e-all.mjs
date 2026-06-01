import fs from 'fs';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
const WEB_URL = process.env.E2E_WEB_URL || 'http://127.0.0.1:5173';

const results = [];

function pushResult(name, status, detail = '') {
  results.push({ name, status, detail });
  const mark = status === 'PASS' ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` - ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return data;
}

async function requestJson(name, { method = 'GET', path, token, body, expected = [200] }) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const data = await parseResponse(response);

  if (!expected.includes(response.status)) {
    throw new Error(`${name} status=${response.status} body=${JSON.stringify(data)}`);
  }

  pushResult(name, 'PASS', `status=${response.status}`);
  return data;
}

async function requestForm(name, { method = 'POST', path, token, formData, expected = [200, 201] }) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: formData
  });

  const data = await parseResponse(response);

  if (!expected.includes(response.status)) {
    throw new Error(`${name} status=${response.status} body=${JSON.stringify(data)}`);
  }

  pushResult(name, 'PASS', `status=${response.status}`);
  return data;
}

function createImageFile() {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2K9YQAAAAASUVORK5CYII=';
  const buffer = Buffer.from(base64, 'base64');
  return new File([buffer], 'car.png', { type: 'image/png' });
}

function isoDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function extractId(payload) {
  return (
    payload?._id ||
    payload?.id ||
    payload?.data?._id ||
    payload?.data?.id ||
    ''
  );
}

async function waitForContract(ownerToken, rentalId, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const contracts = await requestJson('Contracts owner list poll', {
      method: 'GET',
      path: '/api/contracts/owner/my-contracts',
      token: ownerToken,
      expected: [200]
    });
    const match = Array.isArray(contracts)
      ? contracts.find((item) => String(item.rental_request_id) === String(rentalId))
      : null;
    if (match) {
      return match;
    }
    await sleep(1200);
  }
  throw new Error(`Contract not created for rental ${rentalId}`);
}

async function run() {
  const now = Date.now();
  const rand = `${now}${Math.floor(Math.random() * 1000)}`;
  const ownerEmail = `owner_${rand}@mail.com`;
  const renterEmail = `renter_${rand}@mail.com`;
  const password = '12345678';
  const vehiclePlate = `51A${String(now).slice(-5)}`;

  let ownerToken = '';
  let renterToken = '';
  let ownerId = '';
  let renterId = '';
  let vehicleId = '';
  let rental1 = '';
  let rental2 = '';
  let rental3 = '';
  let contractId = '';
  let paymentId = '';
  let disputeId = '';
  let reviewId = '';
  let ownerNotificationId = '';

  try {
    const webRes = await fetch(WEB_URL);
    if (!webRes.ok) {
      throw new Error(`WEB status=${webRes.status}`);
    }
    pushResult('Web reachable', 'PASS', `status=${webRes.status}`);

    await requestJson('Gateway health', {
      method: 'GET',
      path: '/health',
      expected: [200]
    });

    const ownerReg = await requestJson('Register owner', {
      method: 'POST',
      path: '/api/users/register',
      expected: [201],
      body: {
        email: ownerEmail,
        password,
        first_name: 'Owner',
        last_name: 'E2E',
        phone: '0900000001'
      }
    });
    ownerId = ownerReg.id;

    const renterReg = await requestJson('Register renter', {
      method: 'POST',
      path: '/api/users/register',
      expected: [201],
      body: {
        email: renterEmail,
        password,
        first_name: 'Renter',
        last_name: 'E2E',
        phone: '0900000002'
      }
    });
    renterId = renterReg.id;

    const ownerLogin = await requestJson('Login owner', {
      method: 'POST',
      path: '/api/users/login',
      expected: [200],
      body: {
        email: ownerEmail,
        password
      }
    });
    ownerToken = ownerLogin.token;

    const renterLogin = await requestJson('Login renter', {
      method: 'POST',
      path: '/api/users/login',
      expected: [200],
      body: {
        email: renterEmail,
        password
      }
    });
    renterToken = renterLogin.token;

    await requestJson('Get owner profile', {
      method: 'GET',
      path: '/api/users/profile',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Update owner profile', {
      method: 'PUT',
      path: '/api/users/profile',
      token: ownerToken,
      expected: [200],
      body: {
        first_name: 'OwnerUpdated',
        phone: '0900000099',
        address: ['HCMC']
      }
    });

    const createVehicleForm = new FormData();
    createVehicleForm.append('images', createImageFile());
    createVehicleForm.append('vehicle_type', 'CAR');
    createVehicleForm.append('brand', 'Toyota');
    createVehicleForm.append('model', `Vios-${rand.slice(-4)}`);
    createVehicleForm.append('year', '2022');
    createVehicleForm.append('license_plate', vehiclePlate);
    createVehicleForm.append('color', 'Black');
    createVehicleForm.append('transmission', 'AUTOMATIC');
    createVehicleForm.append('fuel_type', 'PETROL');
    createVehicleForm.append('seats', '4');
    createVehicleForm.append('description', 'E2E test vehicle');
    createVehicleForm.append('daily_rate', '500000');
    createVehicleForm.append('deposit_amount', '1000000');
    createVehicleForm.append('allowed_region', 'VIETNAM');
    createVehicleForm.append('pickup_location', '12 Nguyen Hue, Quan 1, TP.HCM');
    createVehicleForm.append('return_location', '12 Nguyen Hue, Quan 1, TP.HCM');

    const vehicle = await requestForm('Create vehicle', {
      method: 'POST',
      path: '/api/vehicles',
      token: ownerToken,
      formData: createVehicleForm,
      expected: [201]
    });
    vehicleId = extractId(vehicle);

    await requestJson('Get available vehicles', {
      method: 'GET',
      path: '/api/vehicles/available/list?page=1&limit=10',
      expected: [200]
    });

    await requestJson('Vehicle search list', {
      method: 'GET',
      path: '/api/vehicles/search/list?q=Toyota&page=1&limit=5',
      expected: [200]
    });

    await requestJson('Vehicle suggestions', {
      method: 'GET',
      path: '/api/vehicles/search/suggestions?q=To&limit=5',
      expected: [200]
    });

    await requestJson('Get vehicle detail', {
      method: 'GET',
      path: `/api/vehicles/${vehicleId}`,
      expected: [200]
    });

    await requestJson('Update vehicle', {
      method: 'PUT',
      path: `/api/vehicles/${vehicleId}`,
      token: ownerToken,
      expected: [200],
      body: {
        color: 'Silver'
      }
    });

    await requestJson('Owner vehicles list', {
      method: 'GET',
      path: `/api/vehicles/owner/${ownerId}/list?page=1&limit=10`,
      expected: [200]
    });

    await requestJson('Vehicle availability false', {
      method: 'PUT',
      path: `/api/vehicles/${vehicleId}/availability`,
      expected: [200],
      body: {
        is_available: false
      }
    });

    await requestJson('Vehicle availability true', {
      method: 'PUT',
      path: `/api/vehicles/${vehicleId}/availability`,
      expected: [200],
      body: {
        is_available: true
      }
    });

    const rentalReq1 = await requestJson('Create rental request #1', {
      method: 'POST',
      path: '/api/rentals/request',
      token: renterToken,
      expected: [201],
      body: {
        vehicle_id: vehicleId,
        rental_start_date: isoDate(1),
        rental_end_date: isoDate(3),
        pickup_location: 'District 1',
        return_location: 'District 7',
        notes: 'First rental'
      }
    });
    rental1 = extractId(rentalReq1);

    const rentalReq2 = await requestJson('Create rental request #2', {
      method: 'POST',
      path: '/api/rentals/request',
      token: renterToken,
      expected: [201],
      body: {
        vehicle_id: vehicleId,
        rental_start_date: isoDate(5),
        rental_end_date: isoDate(7),
        pickup_location: 'District 1',
        return_location: 'District 7',
        notes: 'Second rental'
      }
    });
    rental2 = extractId(rentalReq2);

    const rentalReq3 = await requestJson('Create rental request #3', {
      method: 'POST',
      path: '/api/rentals/request',
      token: renterToken,
      expected: [201],
      body: {
        vehicle_id: vehicleId,
        rental_start_date: isoDate(8),
        rental_end_date: isoDate(9),
        pickup_location: 'District 1',
        return_location: 'District 7',
        notes: 'Third rental'
      }
    });
    rental3 = extractId(rentalReq3);

    await requestJson('Check availability', {
      method: 'POST',
      path: '/api/rentals/check-availability',
      token: renterToken,
      expected: [200],
      body: {
        vehicle_id: vehicleId,
        start_date: isoDate(1),
        end_date: isoDate(2)
      }
    });

    await requestJson('Renter rentals list', {
      method: 'GET',
      path: '/api/rentals/renter/my-rentals',
      token: renterToken,
      expected: [200]
    });

    await requestJson('Owner rentals list', {
      method: 'GET',
      path: '/api/rentals/owner/my-rentals',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Confirm rental #1', {
      method: 'PUT',
      path: `/api/rentals/${rental1}/confirm`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Reject rental #2', {
      method: 'PUT',
      path: `/api/rentals/${rental2}/reject`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Cancel rental #3', {
      method: 'PUT',
      path: `/api/rentals/${rental3}/cancel`,
      token: renterToken,
      expected: [200]
    });

    const contract = await waitForContract(ownerToken, rental1);
    contractId = extractId(contract);
    pushResult('Contract created from event', 'PASS', `contractId=${contractId}`);

    await requestJson('Get contract by id', {
      method: 'GET',
      path: `/api/contracts/${contractId}`,
      token: ownerToken,
      expected: [200]
    });

    const pickupForm = new FormData();
    pickupForm.append('pickup_images', createImageFile());
    pickupForm.append('description', 'Pickup ok');

    await requestForm('Contract pickup', {
      method: 'PUT',
      path: `/api/contracts/${contractId}/pickup`,
      token: ownerToken,
      formData: pickupForm,
      expected: [200]
    });

    const returnForm = new FormData();
    returnForm.append('return_images', createImageFile());
    returnForm.append('description', 'Return ok');

    await requestForm('Contract return', {
      method: 'PUT',
      path: `/api/contracts/${contractId}/return`,
      token: ownerToken,
      formData: returnForm,
      expected: [200]
    });

    const dispute = await requestJson('Create dispute', {
      method: 'POST',
      path: '/api/disputes',
      token: ownerToken,
      expected: [201],
      body: {
        contract_id: contractId,
        claimed_amount: 200000,
        description: 'Small damage on mirror'
      }
    });
    disputeId = extractId(dispute);

    await requestJson('Get dispute by id', {
      method: 'GET',
      path: `/api/disputes/${disputeId}`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('List pending disputes', {
      method: 'GET',
      path: '/api/disputes/pending/list',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Approve dispute', {
      method: 'PUT',
      path: `/api/disputes/${disputeId}/approve`,
      token: ownerToken,
      expected: [200],
      body: {
        admin_decision_amount: 150000,
        admin_notes: 'Approved partial compensation'
      }
    });

    await requestJson('List approved disputes', {
      method: 'GET',
      path: '/api/disputes/approved/list',
      token: ownerToken,
      expected: [200]
    });

    const payment = await requestJson('Create payment', {
      method: 'POST',
      path: '/api/payments',
      token: ownerToken,
      expected: [201],
      body: {
        contract_id: contractId,
        renter_id: renterId,
        owner_id: ownerId,
        payment_type: 'DEPOSIT',
        amount: 1000000,
        payment_method: 'BANK_TRANSFER'
      }
    });
    paymentId = extractId(payment);

    await requestJson('Get payment by id', {
      method: 'GET',
      path: `/api/payments/${paymentId}`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Process payment', {
      method: 'PUT',
      path: `/api/payments/${paymentId}/process`,
      token: renterToken,
      expected: [200],
      body: {
        transaction_id: `TX-${rand}`
      }
    });

    const payment2 = await requestJson('Create payment #2', {
      method: 'POST',
      path: '/api/payments',
      token: ownerToken,
      expected: [201],
      body: {
        contract_id: contractId,
        renter_id: renterId,
        owner_id: ownerId,
        payment_type: 'DAMAGE_COMPENSATION',
        amount: 200000,
        payment_method: 'BANK_TRANSFER'
      }
    });

    await requestJson('Fail payment #2', {
      method: 'PUT',
      path: `/api/payments/${extractId(payment2)}/fail`,
      token: ownerToken,
      expected: [200],
      body: {
        reason: 'Manual fail for test'
      }
    });

    await requestJson('Refund payment #1', {
      method: 'POST',
      path: `/api/payments/${paymentId}/refund`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Renter payments list', {
      method: 'GET',
      path: '/api/payments/renter/my-payments',
      token: renterToken,
      expected: [200]
    });

    await requestJson('Owner payments list', {
      method: 'GET',
      path: '/api/payments/owner/my-payments',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Tracking update location', {
      method: 'POST',
      path: '/api/tracking/location',
      token: ownerToken,
      expected: [200, 201],
      body: {
        vehicle_id: vehicleId,
        rental_id: rental1,
        contract_id: contractId,
        owner_id: ownerId,
        renter_id: renterId,
        latitude: 10.7769,
        longitude: 106.7009,
        source: 'E2E'
      }
    });

    await requestJson('Tracking latest location', {
      method: 'GET',
      path: `/api/tracking/location/${vehicleId}`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Tracking location history', {
      method: 'GET',
      path: `/api/tracking/history/${vehicleId}?start_date=${encodeURIComponent(isoDate(-1))}&end_date=${encodeURIComponent(isoDate(10))}`,
      token: ownerToken,
      expected: [200]
    });

    const review = await requestJson('Create review', {
      method: 'POST',
      path: '/api/reviews',
      token: renterToken,
      expected: [201],
      body: {
        rental_request_id: rental1,
        reviewer_id: renterId,
        reviewed_user_id: ownerId,
        vehicle_id: vehicleId,
        rating: 5,
        comment: 'Good vehicle and owner'
      }
    });
    reviewId = extractId(review);

    await requestJson('Get review by id', {
      method: 'GET',
      path: `/api/reviews/${reviewId}`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Update review', {
      method: 'PUT',
      path: `/api/reviews/${reviewId}`,
      token: renterToken,
      expected: [200],
      body: {
        comment: 'Excellent vehicle',
        rating: 5
      }
    });

    await requestJson('Reviews by user', {
      method: 'GET',
      path: `/api/reviews/user/${ownerId}/reviews`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('User rating', {
      method: 'GET',
      path: `/api/reviews/user/${ownerId}/rating`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Reviews by vehicle', {
      method: 'GET',
      path: `/api/reviews/vehicle/${vehicleId}/reviews`,
      token: ownerToken,
      expected: [200]
    });

    await sleep(2000);
    const ownerNoti = await requestJson('Owner notifications', {
      method: 'GET',
      path: '/api/notifications/my-notifications',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Renter notifications', {
      method: 'GET',
      path: '/api/notifications/my-notifications',
      token: renterToken,
      expected: [200]
    });

    await requestJson('Owner unread notifications', {
      method: 'GET',
      path: '/api/notifications/unread',
      token: ownerToken,
      expected: [200]
    });

    if (Array.isArray(ownerNoti) && ownerNoti.length > 0) {
      ownerNotificationId = extractId(ownerNoti[0]);
      await requestJson('Mark notification read', {
        method: 'PUT',
        path: `/api/notifications/${ownerNotificationId}/read`,
        token: ownerToken,
        expected: [200]
      });
    }

    await requestJson('Mark all notifications read', {
      method: 'PUT',
      path: '/api/notifications/mark-all-read',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Statistics dashboard', {
      method: 'GET',
      path: '/api/statistics/dashboard',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Statistics revenue by month', {
      method: 'GET',
      path: '/api/statistics/revenue-by-month?months=6',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Statistics top vehicles', {
      method: 'GET',
      path: '/api/statistics/top-vehicles?limit=5',
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Delete review', {
      method: 'DELETE',
      path: `/api/reviews/${reviewId}`,
      token: renterToken,
      expected: [200]
    });

    await requestJson('Delete vehicle image index 0', {
      method: 'DELETE',
      path: `/api/vehicles/${vehicleId}/images/0`,
      token: ownerToken,
      expected: [200]
    });

    await requestJson('Delete vehicle', {
      method: 'DELETE',
      path: `/api/vehicles/${vehicleId}`,
      token: ownerToken,
      expected: [200]
    });

    const failCount = results.filter((item) => item.status === 'FAIL').length;
    const passCount = results.filter((item) => item.status === 'PASS').length;
    const summary = {
      pass: passCount,
      fail: failCount
    };

    fs.writeFileSync('e2e-result.json', JSON.stringify({ summary, results }, null, 2));
    console.log('\nE2E SUMMARY:', summary);
  } catch (error) {
    pushResult('E2E Runtime', 'FAIL', error.message);
    const failCount = results.filter((item) => item.status === 'FAIL').length;
    const passCount = results.filter((item) => item.status === 'PASS').length;
    const summary = {
      pass: passCount,
      fail: failCount
    };
    fs.writeFileSync('e2e-result.json', JSON.stringify({ summary, results }, null, 2));
    console.log('\nE2E SUMMARY:', summary);
    process.exit(1);
  }
}

run();
