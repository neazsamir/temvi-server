import { Schema, model } from 'mongoose'
import jwt from 'jsonwebtoken'
import covers from '../constants/covers.js'


const randomCover = covers[Math.floor(Math.random() * covers.length)]
const defaultAvatar = "https://res.cloudinary.com/dnrvzfgom/image/upload/v1752914837/temvi_gp6f47.png"

const userSchema = new Schema({
	username: {
		type: String,
		unique: true,
		required: true,
		minLength: 4,
		maxLength: 20,
		index: true,
	},
	email: {
		type: String,
		required: true,
		unique: true,
		index: true,
	},
	password: {
		type: String,
		required: true
	},
	avatar: {
		type: String,
		default: defaultAvatar
	},
	photos: {
		type: Array,
		default: [defaultAvatar]
	},
	cover: {
		type: String,
		enum: covers,
		default: randomCover
	},
	bio: {
		type: String,
		maxLength: 150,
		default: 'Temvi is awesome 👍🏻😎'
	},
	followers: [{
  type: Schema.Types.ObjectId,
  ref: 'User',
  index: true,
	}],
	following: [{
  type: Schema.Types.ObjectId,
  ref: 'User',
  index: true
	}],
	liked: [{
  type: Schema.Types.ObjectId,
  ref: 'Post',
	}],
	hiddenUsers: [{
  type: Schema.Types.ObjectId,
  ref: 'User'
	}],
	verified: {
		type: Boolean,
		default: false
	},
	_2fa: {
		type: Boolean,
		default: false
	},
	locked: {
		type: Boolean,
		default: false,
	} // if the account is locked
}, { timestamps: true })

userSchema.methods.generateToken = async function () {
		return await jwt.sign({ _id: this._id }, process.env.JWT_SECRET, {
			expiresIn: '7d'
		}
	)
}

const User = model('User', userSchema)

export default User;