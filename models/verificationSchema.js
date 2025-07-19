import { model, Schema } from 'mongoose'


const verificationSchema = new Schema({
	requester: {
		type: String,
		required: true,
		unique: true,
		index: true,
	},
	token: {
		type: String,
		required: true,
		index: true
	},
	createdAt: {
		type: Date,
		default: Date.now,
		index: { expires: 600 }
	},
	lastSentAt: {
		type: Date,
		default: Date.now
	},
	type: {
		type: String,
	}
})




const Verification = model('Verification', verificationSchema)

export default Verification;