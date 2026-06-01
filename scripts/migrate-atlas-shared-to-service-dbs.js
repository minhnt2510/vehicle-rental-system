import fs from 'fs';
import path from 'path';

const COLLECTION_MAPPINGS = [
  { source: 'users', targetDb: 'rentcar_user_db', target: 'users' },
  { source: 'owner_applications', targetDb: 'rentcar_user_db', target: 'owner_applications' },
  { source: 'vehicles', targetDb: 'rentcar_vehicle_db', target: 'vehicles' },
  { source: 'rental_requests', targetDb: 'rentcar_rental_db', target: 'rental_requests' },
  { source: 'contracts', targetDb: 'rentcar_contract_db', target: 'contracts' },
  { source: 'payments', targetDb: 'rentcar_payment_db', target: 'payments' },
  { source: 'disputes', targetDb: 'rentcar_dispute_db', target: 'disputes' },
  { source: 'reviews', targetDb: 'rentcar_review_db', target: 'reviews' },
  { source: 'notifications', targetDb: 'rentcar_notification_db', target: 'notifications' },
  { source: 'statistics', targetDb: 'rentcar_statistic_db', target: 'statistics' },
  { source: 'images', targetDb: 'rentcar_image_db', target: 'images' },
  { source: 'trackings', targetDb: 'rentcar_tracking_db', target: 'trackings' },
  { source: 'vehicle_locations', targetDb: 'rentcar_tracking_db', target: 'vehicle_locations' },
  {
    source: 'vehicle_location_histories',
    targetDb: 'rentcar_tracking_db',
    target: 'vehicle_location_histories'
  },
  { source: 'movement_histories', targetDb: 'rentcar_tracking_db', target: 'movement_histories' },
  { source: 'boundary_alerts', targetDb: 'rentcar_tracking_db', target: 'boundary_alerts' }
];

function loadEnvFromRoot() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const splitIndex = trimmed.indexOf('=');
    if (splitIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, splitIndex).trim();
    let value = trimmed.slice(splitIndex + 1).trim();
    if (!key) {
      continue;
    }

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

async function resolveMongoClient() {
  try {
    const { MongoClient } = await import('mongodb');
    return MongoClient;
  } catch (error) {
    console.error(
      'Cannot load mongodb package. Run "npm install mongodb" at repository root, then run this script again.'
    );
    throw error;
  }
}

async function migrate() {
  loadEnvFromRoot();

  const baseUri =
    process.env.MONGO_ATLAS_BASE_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.USER_MONGO_URI;
  const sourceDbName = process.env.SOURCE_DB || 'rental_vehicle_db';
  const dryRunFromArg = process.argv.includes('--dry-run');
  const dryRun = dryRunFromArg || String(process.env.DRY_RUN || '').toLowerCase() === 'true';

  if (!baseUri) {
    throw new Error(
      'Missing Atlas URI. Set MONGO_ATLAS_BASE_URI (recommended) or MONGODB_URI before running.'
    );
  }

  const MongoClient = await resolveMongoClient();
  const client = new MongoClient(baseUri, {
    serverSelectionTimeoutMS: 20000
  });

  const summary = [];
  try {
    await client.connect();
    console.log(`Connected to Atlas. Source DB: ${sourceDbName}`);

    const sourceDb = client.db(sourceDbName);
    const sourceCollections = new Set((await sourceDb.listCollections().toArray()).map((c) => c.name));

    for (const map of COLLECTION_MAPPINGS) {
      if (!sourceCollections.has(map.source)) {
        console.log(`Skip ${map.source}: not found in source DB`);
        continue;
      }

      const sourceCollection = sourceDb.collection(map.source);
      const docs = await sourceCollection.find({}).toArray();
      const targetCollection = client.db(map.targetDb).collection(map.target);

      if (dryRun) {
        console.log(`[DRY_RUN] ${map.source} -> ${map.targetDb}.${map.target}: ${docs.length} docs`);
        summary.push({
          source: map.source,
          target: `${map.targetDb}.${map.target}`,
          count: docs.length
        });
        continue;
      }

      await targetCollection.deleteMany({});
      if (docs.length > 0) {
        await targetCollection.insertMany(docs, { ordered: false });
      }

      console.log(`${map.source} -> ${map.targetDb}.${map.target}: ${docs.length} docs`);
      summary.push({
        source: map.source,
        target: `${map.targetDb}.${map.target}`,
        count: docs.length
      });
    }

    if (!dryRun) {
      console.log('\nPost-migration counts:');
      const checks = [
        ['rentcar_user_db', 'users'],
        ['rentcar_vehicle_db', 'vehicles'],
        ['rentcar_rental_db', 'rental_requests'],
        ['rentcar_contract_db', 'contracts'],
        ['rentcar_payment_db', 'payments']
      ];

      for (const [dbName, collection] of checks) {
        const count = await client.db(dbName).collection(collection).countDocuments();
        console.log(`- ${dbName}.${collection}: ${count}`);
      }
    }

    console.log('\nMigration summary:');
    for (const item of summary) {
      console.log(`- ${item.source} -> ${item.target}: ${item.count}`);
    }
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
