import mongoose from 'mongoose';

export const connectDb = async () => {
  const mongoUri =
    process.env.TRACKING_MONGO_URI ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  await mongoose.connect(mongoUri);
  console.log('Tracking Service connected to MongoDB');
};
