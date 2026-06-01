import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Vehicle from '../src/models/Vehicle.js';
import { resolveCoordinates, toGeoPoint } from '../src/constants/geoLocation.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const BATCH_SIZE = 200;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const query = {
    $or: [
      { geo_location: { $exists: false } },
      { 'geo_location.coordinates.0': { $exists: false } },
      { latitude: { $in: [null, undefined] } },
      { longitude: { $in: [null, undefined] } }
    ]
  };

  const cursor = Vehicle.find(query).lean().cursor();
  let processed = 0;
  let updated = 0;
  let ops = [];

  for await (const vehicle of cursor) {
    processed += 1;
    const resolved = resolveCoordinates(vehicle);
    if (!resolved) {
      continue;
    }

    ops.push({
      updateOne: {
        filter: { _id: vehicle._id },
        update: {
          $set: {
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            geo_location: toGeoPoint(resolved),
            updated_at: new Date()
          }
        }
      }
    });

    if (ops.length >= BATCH_SIZE) {
      const result = await Vehicle.bulkWrite(ops, { ordered: false });
      updated += Number(result.modifiedCount || 0);
      ops = [];
    }
  }

  if (ops.length > 0) {
    const result = await Vehicle.bulkWrite(ops, { ordered: false });
    updated += Number(result.modifiedCount || 0);
  }

  console.log(`Geo backfill completed. Processed=${processed}, Updated=${updated}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Geo backfill failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
