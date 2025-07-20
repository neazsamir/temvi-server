import Notification
from '../models/notificationSchema.js'
import User from '../models/userSchema.js'
import normalizeText from '../utils/normalizeText.js'
import { escapeRegex } from '../utils/escapeRegex.js'
import sanitize from '../utils/textSanitizer.js'
import cloudinary from '../utils/cloudinary.js'
import redis from '../utils/redis.js'
import mongoose from 'mongoose'
import crypto from 'crypto'
import fs from 'fs'
import vibesEnum from '../constants/vibes.js'



export const getMyData = async (req, res, next) => {
	try {
		const user = await User.aggregate([
			{ $match: { _id: req.user._id }},
			{
				$project: {
					username: 1,
					email: 1,
					blocked: 1,
					createdAt: 1,
					verified: 1,
					_2fa: 1,
					bio: 1,
					avatar: 1,
					cover: 1,
					vibes: 1,
					_id: 1,
					following: {
						$size: "$following"
					},
					followers: {
						$size: "$followers"
					}
			}
		}
		])
		
		const notifications = await Notification.find({ receiver: req.user._id }).sort({ createdAt: -1 }).select('-reciever').lean()
		
		return res.json({ success: true, user: { ...user[0], notifications }})
	} catch (e) {
		next(e)
	}
}

export const followingList = async (req, res, next) => {
	try {
		const username = normalizeText(req.query.username)
		
		if (!username) return next({ msg: 'Username is required', status: 400 })
		
		const list = await User.findOne({ username }, {
			following: 1,
			_id: 0,
		}).populate('following', 'username avatar')
		
		if (!list) return next({ msg: 'User not found', status: 404, })
		
		return res.json({ success: true, list: list.following })
	} catch (e) {
		next(e)
	}
}

export const getUserData = async (req, res, next) => {
	try {
		const username = normalizeText(req.params.username)
		
		const [user] = await User.aggregate([
			{ $match: { username} },
			{
				$project: {
					username: 1,
					bio: 1,
					avatar: 1,
					cover: 1,
					vibes: 1,
					_id: 1,
					following: {
						$size: "$following"
					},
					followers: {
						$size: "$followers"
					}
				}
			}, {$limit: 1}
		])
		
		
		if (!user) return next({ status: 404, msg: 'User not found', extraDetails: { status: 404 } })
		
		const imFollowing = await User.exists({
			_id: req.user._id,
			following:user._id,
		})
		
		const hidden = await User.exists({
			_id: req.user._id,
			hiddenUsers: user._id,
		})
		
		return res.json({
			success: true,
			user: { ...user,
			imFollowing: imFollowing ? true : false,
			hidden: hidden ? true : false
			}})
		
	} catch (e) {
		next(e)
	}
}

export const follow = async (req, res, next) => {
	const session = await mongoose.startSession()
	const abortAndEnd = async () => {
		await session.abortTransaction()
		session.endSession()
	}
	
	try {
		const username = normalizeText(req.body.username)
		
		if (!req.user.verified) return next({ status: 401, msg: 'Please verify your email to follow' })
		
		if (!username) {
			await abortAndEnd()
			return next({ status: 400, msg: "Username not provided"})
		}
		
		session.startTransaction()
		
		const user = await User.findOne({username}, {_id: 1}).session(session)
		const {_id:myId, username:myUsername} = req.user
		
		if (!user) {
			await abortAndEnd()
			return next({ status: 404, msg: "User does not exist" })
		}
		
		if (user._id.equals(myId)) {
			await abortAndEnd()
			return next({ status: 400, msg: 'You cannot follow yourself' })
		}
		
		const alreadyFollowing = await User.exists({
			_id: myId,
			following:user._id,
		}).session(session)
		
		if (alreadyFollowing) {
			await abortAndEnd()
			return next({ status: 400, msg: 'Already following' })
		}
		
		const updateUser = {
			$addToSet: {
				followers: myId
			}
		}
		
		await Promise.all([
			 User.updateOne({username}, updateUser).session(session),
			 User.updateOne({_id: myId}, {$addToSet: {following: user._id}}).session(session),
			 Promise.resolve()
		])
		await session.commitTransaction()
		session.endSession()
		
		return res.json({ success: true, msg: `You're following @${username.toUpperCase()}` })
		
	} catch (e) {
		await abortAndEnd()
		next(e)
	}
}

export const unfollow = async (req, res, next) => {
	const session = await mongoose.startSession()
	const abortAndEnd = async () => {
		await session.abortTransaction()
		session.endSession()
	}
	
	try {
		session.startTransaction()
		const username = normalizeText(req.body?.username)
		if (!username) {
			await abortAndEnd()
			return next({ status: 400, msg: "Username not provided"})
		}
		
		
		const myId = req.user._id
		const targetUser = await User.findOne({username}).session(session)
		
		if (!targetUser) {
			await abortAndEnd()
			return next({ status: 404, msg: "User not found"})
		}
		
		const notFollowing = await User.findOne({_id: myId, following: {$in: [targetUser._id]}}).session(session)
		
		if (!notFollowing) {
			await abortAndEnd()
			return next({ status: 400, msg: `You are not following @${username.toUpperCase()}` })
		}
		
		await Promise.all([
			User.updateOne({_id: targetUser?._id},
			{ $pull: { followers: myId }}).session(session),
			User.updateOne({_id: myId},
			{ $pull: { following: targetUser._id }}).session(session),
		])
		
		await session.commitTransaction()
		session.endSession()
		return res.json({success: true})
		
	} catch (e) {
		await abortAndEnd()
		next(e)
	}
}

export const search = async (req, res, next) => {
	try {
		const { _id, username } = req.user
		const query = escapeRegex(normalizeText(req.query.q))
		const regex = new RegExp('^' + query, 'i')
		const result = await User.find({
			$and: [
				{ username: regex },
				{ username: { $ne: username }}
			]
		}, {username: 1, avatar: 1}).limit(15)
		return res.json({ success: true, result })
	} catch (e) {
		next(e)
	}
}

export const setSearchHistory = async (req, res, next) => {
	try {
		const username = normalizeText(req.body.username)
		if (!username) return res.status(400).json({ success: false })

		const userExists = await User.exists({ username })
		if (!userExists) return res.status(404).json({ success: false })

		const me = req.user._id

		const key = `search-history:${me}`

		await redis.lrem(key, 0, username)
		await redis.lpush(key, username)
		await redis.ltrim(key, 0, 19)

		return res.json({ success: true })
	} catch (e) {
		next(e)
	}
}

export const getSearchHistory = async (req, res, next) => {
	try {
		const me = req.user._id
		const key = `search-history:${me}`
		const history = await redis.lrange(key, 0, 19)

		if (!history.length) return res.json({ success: true, history: [] })

		const data = await User.find({ username: { $in: history } }).select('username avatar')

		const sorted = history
			.map((username) => data.find((user) => user.username === username))
			.filter(Boolean)

		return res.json({ success: true, history: sorted })
	} catch (e) {
		next(e)
	}
}

export const deleteSearchHistory = async (req, res, next) => {
	try {
		const username = normalizeText(req.body.username)
		if (!username) return next({ status:400 })

		const key = `search-history:${req.user._id}`
		await redis.lrem(key, 0, username)


		return res.json({ success: true })
	} catch (e) {
		next(e)
	}
}

export const getNotification = async (req, res, next) => {
	try {
		const { user } = req
		const notifications = await Notification.find({
			receiver: user._id
		}, { receiver: -1 })
		.sort({ createdAt: -1 })
		.limit(50)
		
		return res.json({ success: true, notifications })
	} catch (e) {
		return next({ msg: 'Failed to fetch notifications' })
	}
}

export const deleteNotification = async (req, res, next) => {
	try {
		const { user } = req
		const { notificationId } = req.body
		if (!notificationId) return next({ status: 400, msg: 'Notification id is required' })
		
		if (!mongoose.isValidObjectId(notificationId))
			return next({ status: 400, msg: 'Invalid notification id' })
		
		const updated = await Notification.findByIdAndUpdate(notificationId, {
			$pull: { receiver: user._id, }
		}, { new: true })
		
		if (!updated) return next({ status: 404, msg: 'Notification not found' })
		
		if (updated.receiver?.length <= 0) {
			await Notification.deleteOne({ _id: updated._id })
		}

		
		return res.json({ success: true })
	} catch (e) {
		return next({ msg: 'Failed to delete notifications' })
	}
}

export const toggleHideUser = async (req, res, next) => {
	try {
		const { userId } = req.body
		if (!userId) return next({ status: 400, msg: 'userId is required' })

		if (!mongoose.isValidObjectId(userId))
			return next({ status: 400, msg: 'Invalid post id' })
			
		const me = req.user
		
		
		
		if (me._id.equals(userId)) {
			return next({ status: 400, msg: 'You cannot hide yourself' })
		}

		const userExists = await User.findOne({ _id: userId }).select('username')
		if (!userExists) {
			return next({ status: 404, msg: 'User not found' })
		}

		const isHidden = await User.exists({
			_id: me._id,
			hiddenUsers: userId
		})

		const update = isHidden
			? { $pull: { hiddenUsers: userId } }
			: { $addToSet: { hiddenUsers: userId } }

		await User.updateOne({ _id: me._id }, update)

		const action = isHidden ? 'unhidden' : 'hidden'
		const msg = isHidden
			? `You will now see posts from @${userExists.username.toUpperCase()}`
			: `You will not see posts from @${userExists.username.toUpperCase()}`

		return res.json({ success: true, toggled: true, action, msg })
	} catch (e) {
		return next({ msg: 'Failed' })
	}
}

export const updateBio = async (req, res, next) => {
	try {
		const text = sanitize(req.body.text?.trim()?.slice(0, 150) || '')
		
		if (!text) return next({ status: 400, msg: 'Text is required' })
		
		await User.updateOne({ _id: req.user._id }, {
			$set: { bio: text }
		})
		
		return res.json({ success: true, msg: 'Profile updated' })
	} catch (e) {
		return next({ msg: 'Failed to update your bio' })
	}
}

export const updateAvatar = async (req, res, next) => {
	try {
		const filePath = req.file.path
		const result = await cloudinary.uploader.upload(
			filePath,
			{
				folder: 'temvi',
				transformation: {
					width: 500,
					height: 500,
					crop: 'fill',
					gravity: 'auto'
				}
			})
		
		fs.unlinkSync(filePath)
		
		await User.updateOne({ _id: req.user._id }, {
			$set: { avatar: result.secure_url },
			$push: { photos: result.secure_url }
		})
		
		return res.json({ success: true, url: result.secure_url, public_id: result.public_id })
	} catch (e) {
		fs.unlinkSync(req.file.path)
		next({ msg: 'Failed to update avatar' })
	}
}

export const getPhotos = async (req, res, next) => {
	try {
		const username = normalizeText(req.query.username)
		
		if (!username) return next({ status: 400, msg: 'Username is required'})
		
		const user = await User.findOne({ username }).select('photos')
		
		if (!user) return next({ status: 404, msg: 'User not found'})
		
		return res.json({ success: true, photos: user.photos })
	} catch (e) {
		next({ msg: 'Failed to fetch photos' })
	}
}

export const updateCover = async (req, res, next) => {
	try {
		const { cover } = req.body

		await User.updateOne({ _id: req.user._id, }, {
			$set: { cover }
		})
		
		return res.json({ success: true })
	} catch (e) {
		next({ msg: 'Failed to update cover' })
	}
}

export const addVisitor = async (req, res, next) => {
	try {
		const username = normalizeText(req.body.username)
		const visitor = normalizeText(req.body.visitor)

		const userExists = await User.exists({ username })
		const visitorExists = await User.exists({ username: visitor })

		if (!userExists || !visitorExists) {
			return next({ status: 404, success: false, msg: 'User or visitor not found' })
		}

		const listKey = `visitors:list:${username}`
		const setKey = `visitors:set:${username}`
		const timeKey = `visitors:time:${username}`

		const isAlreadyVisited = await redis.sismember(setKey, visitor)
		if (isAlreadyVisited) {

			await redis.hset(timeKey, visitor, Date.now())
			return res.status(200).json({ success: true, msg: 'Visitor already added' })
		}

		await redis.lpush(listKey, visitor)
		await redis.sadd(setKey, visitor)
		await redis.hset(timeKey, visitor, Date.now())
		await redis.ltrim(listKey, 0, 29)

		const listLength = await redis.llen(listKey)
		if (listLength > 30) {
			const removed = await redis.rpop(listKey)
			if (removed) {
				await redis.srem(setKey, removed)
				await redis.hdel(timeKey, removed)
			}
		}

		return res.json({ success: true })
	} catch (e) {
		return next(e)
	}
}

export const getVisitors = async (req, res, next) => {
	try {
		const username = normalizeText(req.query.username)

		const userExists = await User.exists({ username })
		if (!userExists) {
			return next({ status: 404, success: false, msg: 'User not found' })
		}

		const listKey = `visitors:list:${username}`
		const timeKey = `visitors:time:${username}`

		const visitorUsernames = await redis.lrange(listKey, 0, -1)
		if (!visitorUsernames.length) {
			return res.status(200).json({ success: true, visitors: [] })
		}

		const [users, timeMap] = await Promise.all([
			User.find({ username: { $in: visitorUsernames } }).select('avatar username'),
			redis.hmget(timeKey, ...visitorUsernames),
		])


		const userMap = Object.fromEntries(users.map(user => [user.username, user]))

		const visitors = visitorUsernames.map((uname, index) => {
			const user = userMap[uname]
			if (!user) return null

			return {
				username: user.username,
				avatar: user.avatar,
				visitedAt: Number(timeMap[index]),
			}
		}).filter(Boolean)

		return res.status(200).json({ success: true, visitors })
	} catch (e) {
		return next({ status: 500, success: false, msg: 'Server error' })
	}
}

export const updateVibes = async (req, res, next) => {
	try {
		const { user } = req;
		const { vibes } = req.body;

		if (!Array.isArray(vibes)) {
			return next({ msg: 'Vibes must be an array.' });
		}

		if (vibes.length === 0 || vibes.length > 3) {
			return next({ msg: 'Select 1 to 3 vibes only.' });
		}

		const uniqueVibes = [...new Set(vibes)];
		if (uniqueVibes.length !== vibes.length) {
			return next({ msg: 'Duplicate vibes are not allowed.' });
		}

		const invalid = vibes.find(vibe => !vibesEnum.includes(vibe));
		if (invalid) {
			return next({ msg: `Invalid vibe: ${invalid}` });
		}

		await User.updateOne({ _id: user._id }, {
			$set: { vibes: uniqueVibes }
		})

		res.json({ msg: 'Vibes updated successfully.', vibes: uniqueVibes });
	} catch (e) {
		next({ msg: 'Failed to update vibes. Try again' });
	}
};