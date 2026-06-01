import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

const COLLECTION_MAPPINGS = [
  { source: 'users', targetDb: 'rentcar_user_db', target: 'users' },
  { source: 'owner_applications', targetDb: 'rentcar_user_db', target: 'owner_applications' },
  { source: 'vehicles', targetDb: 'rentcar_vehicle_db', target: 'vehicles' },
  { source: 'rental_requests', targetDb: 'rentcar_rental_db', target: 'rental_requests' },
  { source: 'contracts', targetDb: 'rentcar_contract_db', target: 'contracts' },
  { source: 'payments', targetDb: 'rentcar_payment_db', target: 'payments' },
  { source: 'trackings', targetDb: 'rentcar_tracking_db', target: 'trackings' },
  { source: 'vehicle_locations', targetDb: 'rentcar_tracking_db', target: 'vehicle_locations' },
  {
    source: 'vehicle_location_histories',
    targetDb: 'rentcar_tracking_db',
    target: 'vehicle_location_histories'
  },
  { source: 'movement_histories', targetDb: 'rentcar_tracking_db', target: 'movement_histories' },
  { source: 'boundary_alerts', targetDb: 'rentcar_tracking_db', target: 'boundary_alerts' },
  { source: 'disputes', targetDb: 'rentcar_dispute_db', target: 'disputes' },
  { source: 'reviews', targetDb: 'rentcar_review_db', target: 'reviews' },
  { source: 'notifications', targetDb: 'rentcar_notification_db', target: 'notifications' },
  { source: 'statistics', targetDb: 'rentcar_statistic_db', target: 'statistics' },
  { source: 'images', targetDb: 'rentcar_image_db', target: 'images' }
];

function loadEnvFromRoot() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
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

async function run() {
  loadEnvFromRoot();

  const sourceUri =
    process.env.LOCAL_MONGO_URI ||
    'mongodb://admin:password@localhost:27017/rental_vehicle_db?authSource=admin';
  const sourceDbName = process.env.LOCAL_SOURCE_DB || 'rental_vehicle_db';
  const atlasBaseUri =
    process.env.MONGO_ATLAS_BASE_URI ||
    toBaseUri(process.env.MONGODB_URI || '') ||
    toBaseUri(process.env.USER_MONGO_URI || '');
  const dryRun =
    process.argv.includes('--dry-run') ||
    String(process.env.DRY_RUN || '').toLowerCase() === 'true';

  if (!atlasBaseUri) {
    throw new Error('Missing Atlas URI. Set MONGO_ATLAS_BASE_URI or MONGODB_URI.');
  }

  const sourceClient = new MongoClient(sourceUri, { serverSelectionTimeoutMS: 10000 });
  const atlasClient = new MongoClient(atlasBaseUri, { serverSelectionTimeoutMS: 20000 });

  await sourceClient.connect();
  await atlasClient.connect();

  try {
    const sourceDb = sourceClient.db(sourceDbName);
    const sourceCollectionSet = new Set(
      (await sourceDb.listCollections().toArray()).map((item) => item.name)
    );

    console.log(`Source: ${sourceUri} | db=${sourceDbName}`);
    console.log(`Target: Atlas split DBs`);

    for (const map of COLLECTION_MAPPINGS) {
      if (!sourceCollectionSet.has(map.source)) {
        console.log(`Skip ${map.source}: not found in local source`);
        continue;
      }

      const docs = await sourceDb.collection(map.source).find({}).toArray();
      const targetCol = atlasClient.db(map.targetDb).collection(map.target);

      if (dryRun) {
        console.log(`[DRY_RUN] ${map.source} -> ${map.targetDb}.${map.target}: ${docs.length}`);
        continue;
      }

      await targetCol.deleteMany({});
      if (docs.length) {
        await targetCol.insertMany(docs, { ordered: false });
      }
      console.log(`${map.source} -> ${map.targetDb}.${map.target}: ${docs.length}`);
    }

    console.log('Local to Atlas split migration done.');
  } finally {
    await sourceClient.close();
    await atlasClient.close();
  }
}

run().catch((error) => {
  console.error('migrate:local:atlas:split failed:', error.message);
  process.exit(1);
});

