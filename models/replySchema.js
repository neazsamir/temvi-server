import { model, Schema } from 'mongoose'



const replySchema = new Schema({
	text: { type: String, required: true },
	userId: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		index: true
	},
	commentId: {
		type: Schema.Types.ObjectId,
		ref: 'Comment',
		index: true
	},
	postId: {
		type: Schema.Types.ObjectId,
		ref: 'Comment',
		index: true
	},
	createdAt: { type: Date, default: Date.now }
})

const Reply = model('Reply', replySchema)

export default Reply;