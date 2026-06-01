import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

function loadEnvFromRoot() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function toBaseUri(uri = '') {
  if (!uri) return '';
  const withoutParams = uri.split('?')[0];
  const slash = withoutParams.lastIndexOf('/');
  if (slash <= 'mongodb+srv://'.length) return uri;
  const base = withoutParams.slice(0, slash);
  const params = uri.includes('?') ? `?${uri.split('?')[1]}` : '';
  return `${base}${params}`;
}

const CHECKS = [
  ['rentcar_user_db', 'users'],
  ['rentcar_user_db', 'owner_applications'],
  ['rentcar_vehicle_db', 'vehicles'],
  ['rentcar_rental_db', 'rental_requests'],
  ['rentcar_contract_db', 'contracts'],
  ['rentcar_payment_db', 'payments'],
  ['rentcar_tracking_db', 'trackings'],
  ['rentcar_tracking_db', 'vehicle_locations'],
  ['rentcar_dispute_db', 'disputes'],
  ['rentcar_review_db', 'reviews'],
  ['rentcar_notification_db', 'notifications'],
  ['rentcar_statistic_db', 'statistics'],
  ['rentcar_image_db', 'images']
];

async function run() {
  loadEnvFromRoot();
  const baseUri =
    process.env.MONGO_ATLAS_BASE_URI ||
    toBaseUri(process.env.MONGODB_URI || '') ||
    toBaseUri(process.env.USER_MONGO_URI || '');

  if (!baseUri) {
    throw new Error('Missing Atlas URI. Set MONGO_ATLAS_BASE_URI or MONGODB_URI.');
  }

  const client = new MongoClient(baseUri, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  try {
    console.log('ATLAS CHECK REPORT');
    let hasUsers = 0;
    let hasVehicles = 0;

    for (const [dbName, collection] of CHECKS) {
      const db = client.db(dbName);
      const exists = await db.listCollections({ name: collection }).hasNext();
      const count = exists ? await db.collection(collection).countDocuments() : 0;
      console.log(`- ${dbName}.${collection}: ${count}${exists ? '' : ' (collection not found)'}`);

      if (dbName === 'rentcar_user_db' && collection === 'users') hasUsers = count;
      if (dbName === 'rentcar_vehicle_db' && collection === 'vehicles') hasVehicles = count;
    }

    if (hasUsers <= 0 || hasVehicles <= 0) {
      console.log('\nRESULT: MISSING_CRITICAL_DATA');
      process.exitCode = 2;
      return;
    }

    console.log('\nRESULT: OK');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('check:atlas failed:', error.message);
  process.exit(1);
});

