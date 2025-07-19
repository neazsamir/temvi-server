import { Schema, model } from 'mongoose'



const postSchema = new Schema({
	creator: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true,
		index: true
	},
	text: { type: String, trim: true },
	images: {
		type: Array,
		maxLength: 4,
	},
	createdAt: {
		type: Date,
		default: Date.now
	},
	visibility: {
		type: String,
		enum: ['public', 'private', 'followers'],
		default: 'public',
		index: true
	},
	likes: {
		type: Number,
		default: 0
	},
	comments: {
		type: Number,
		default: 0
	},
})


const Post = model('Post', postSchema)

export default Post;