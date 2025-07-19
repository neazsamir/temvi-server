import { Schema, model } from 'mongoose'


const notificationSchema = new Schema({
	message: String,
	type: String,
	payload: {
		type: Object,
		index: true
	},
	receiver: [{
		type: Schema.Types.ObjectId,
		ref: 'User',
		index: true
	}],
	createdAt: {
		type: Date,
		default: Date.now,
		index: { expires: '7d' }
	}
})


const NotificationModel = model('Notification', notificationSchema)



export default NotificationModel;