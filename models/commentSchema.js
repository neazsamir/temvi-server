import { model, Schema } from 'mongoose'



const commentSchema = new Schema({
	text: { type: String, required: true },
	userId: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		index: true
	},
	postId: {
		type: Schema.Types.ObjectId,
		ref: 'Post',
		index: true
	},
	replyCount: {
		type: Number,
		default: 0
	},
	createdAt: { type: Date, default: Date.now }
})

const CommentModel = model('Comment', commentSchema)

export default CommentModel;