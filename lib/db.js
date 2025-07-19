import mongoose from 'mongoose'
import Verification
from '../models/verificationSchema.js'


const connectDB = async () => {
	const URI = process.env.MONGODB_URI
	
	try {
		await mongoose.connect(URI)
	  await Verification.syncIndexes()
		console.log('Connected to DB')
	} catch (e) {
		console.log('DB connection failed: ', e)
	}
}

export default connectDB;