import normalizeText from '../utils/normalizeText.js'
import sanitizeText from '../utils/textSanitizer.js'
import { incrementAttempts, getAttempts }
from '../utils/attemptsCounter.js'
import { checkBase64 } from '../utils/checkBase64.js'
import getMidnight from '../utils/getMidnight.js'
import mongoose from 'mongoose'
import Post from '../models/postSchema.js'
import User from '../models/userSchema.js'
import Comment from '../models/commentSchema.js'
import Notification from '../models/notificationSchema.js'
import Reply from '../models/replySchema.js'
import redis from '../utils/redis.js'
import lodash from 'lodash'
import cloudinary from '../utils/cloudinary.js'





export const post = async (req, res, next) => {
	try {
		const { user } = req
		const io = req.app.get('io')
		const onlineUsers = io.onlineUsers
		let { text, images, visibility } = req.body
		const visibilityEnum = ['public', 'private', 'followers']
		const attempts = await getAttempts('postCreated', user.email)
		images = images?.slice(0, 4)
		text = sanitizeText(text?.trim())?.slice(0, 400)
		visibility = normalizeText(visibility)
		
		if (!user.verified) return next({ status: 401, msg: 'Please verify your email to create post' })
		if (!text && (!images || images.length <= 0)) return next({ status: 400, msg: 'Text or image content is required' })
		if (!visibilityEnum.includes(visibility)) visibility = 'public'
		if (attempts >= 50) return next({ status: 400, msg: 'Spam post detected' })
		
		const imagesUrls = []
		
		for (const base64 of images) {
			const valid = checkBase64(base64)
			if (!valid) return next({ status: 400, msg: 'Only JPEG, JPG, PNG, and WEBP image formats are allowed' })
			
			try {
				const result = await cloudinary.uploader.upload(base64, {
					folder: 'temvi/posts'
				})
				
				imagesUrls.push(result.secure_url)
			} catch (e) {
				console.log('Error uploading post photos', e)
				next({ msg: 'Image upload failed. Try again' })
			}
		}
		
		const newPost = await Post.create({
			creator: user._id,
			text,
			images: imagesUrls,
			visibility
		})
		
		if (text.includes('@followers')) {
			const mentionedToday = await getAttempts('mentionedFollowers', user.email)
			const myFollowers = await User.findById(user._id).select('followers')
			
			if (mentionedToday <= 1) {
				const lockTime = getMidnight()
				const notification = await Notification.create({
				type: 'mention',
				message: `@${user.username.toUpperCase()} mentioned you in a post`,
				payload: {
					postId: newPost._id,
					sender: user.avatar,
				},
				receiver: myFollowers.followers,
			})
			await incrementAttempts('mentionedFollowers', user.email, lockTime)
			}
			
				
			for (const followerId of myFollowers.followers) {
				const socketId = onlineUsers.get(followerId.toString())
				if (socketId) {
					io.to(socketId).emit('notification', {
						type: 'mention',
						message: `@${user.username.toUpperCase()} mentioned you in a post`,
						payload: {
						postId: newPost._id,
						sender: user.avatar,
					},
				})
				}
			}
		}
		
		incrementAttempts('postCreated', user.email, 60 * 60 * 24)
		
		return res.status(201).json({ success: true, msg: 'Post created', data: newPost })
	} catch (e) {
		return next({ msg: 'Failed to create post. Please try again later' })
	}
}

export const getSinglePost = async (req, res, next) => {
	try {
		if (!req.params?.postId?.trim()) return next({ status: 400, msg: 'Post id is required' })
		
		if (!mongoose.isValidObjectId(req.params.postId))
			return next({ status: 400, msg: 'Invalid post id' })
		
		const postId = new mongoose.Types.ObjectId(req.params.postId)
		const { user } = req
		
		
		const post = await Post.findById(postId).populate('creator', 'username avatar').lean()
		
		if (!post) return next({ status: 404, msg: 'Post does not exist' })
		
		const isOwner = user._id.equals(post.creator)
		
		if (post.visibility === 'private' && !isOwner) return next({ status: 401, msg: 'The post is private' })
		
		const followingCreator = await User.exists({ _id: user._id, following: post.creator })
		
		if (post.visibility === 'followers' && (!followingCreator || !isOwner)) return next({ status: 401, msg: 'Only followers can view this post' })
		
		const isLiked = await User.exists({ _id: user._id, liked: post._id })
		
		res.json({ success: true, post: {...post, liked: isLiked ? true : false} })
	} catch (e) {
		next({ msg: 'Failed to fetch' })
	}
}

export const likePost = async (req, res, next) => {
	try {
		const { postId } = req.body
		
		if (!postId?.trim()) return next({ status: 400, msg: 'Post id not provided' })
		
		if (!mongoose.isValidObjectId(postId))
			return next({ status: 400, msg: 'Invalid post id' })
		
		const postObjId = new mongoose.Types.ObjectId(postId)
		
		if (!mongoose.isValidObjectId(postObjId))
			return next({ status: 400, msg: 'Invalid post id' })
		
		const post = await Post.findOne({ _id: postId })
		
		if (!post) return next({ status: 404, msg: 'Post does not exist or deleted' })
		
		const isOwner = post.creator.equals(req.user._id)
		
		
		
		const alreadyLiked = await User.findOne(
			{ 
				_id: req.user._id,
				liked: postObjId
			},
			{ _id: 1 }
		)
		
		
		if (alreadyLiked) return next({ status: 409, msg: 'Already liked the post' })
		
		const followingCreator = await User.findOne(
			{
				_id: req.user._id,
				following: post.creator
			},
			{ _id: 1 }
		)
		
		if (post.visibility === 'private' && !isOwner) return next({ status: 403, msg: 'You cannot like a private post' })
		
	 if (post.visibility === 'followers' && !isOwner && !followingCreator) return next({ status: 403, msg: 'Only followers can like this post' })
		
		
		await Promise.all([
			User.updateOne({ _id: req.user._id }, {
				$push: { liked: postId }
			}),
			Post.updateOne({ _id: postId }, {
				$inc: { likes: 1 }
			})
		])
		
		return res.json({ success: true })
	} catch (e) {
		return next({ msg: 'Failed to like the post. Please try again later' })
	}
}

export const editPost = async (req, res, next) => {
	try {
		let { postId, text, images, visibility } = req.body
		const { user } = req
		const visibilityEnum = ['public', 'private', 'followers']

		if (!mongoose.isValidObjectId(postId)) {
			return next({ status: 400, msg: 'Invalid post ID' })
		}

		const post = await Post.findById(postId).select('creator images').lean()
		if (!post) return next({ status: 404, msg: 'Post not found' })
		if (!post.creator.equals(user._id)) {
			return next({ status: 403, msg: 'You cannot edit others\' posts' })
		}

		images = images?.slice(0, 4) || []
		text = sanitizeText(text?.trim())?.slice(0, 400)
		visibility = normalizeText(visibility)
		if (!text && images.length === 0) {
			return next({ status: 400, msg: 'Image or text content is required' })
		}
		if (!visibilityEnum.includes(visibility)) visibility = 'public'

		const removedImages = (post.images || []).filter(oldUrl => !images.includes(oldUrl))

		for (const url of removedImages) {
			try {
				const parts = url.split('/')
				const uploadIndex = parts.findIndex(p => p === 'upload')
				const publicIdParts = parts.slice(uploadIndex + 2)
				const lastPart = publicIdParts.pop()
				const fileName = lastPart.substring(0, lastPart.lastIndexOf('.'))
				publicIdParts.push(fileName)
				const publicId = publicIdParts.join('/')
				const destroyResult = await cloudinary.uploader.destroy(publicId)
			} catch (e) {}
		}

		await Post.updateOne({ _id: postId }, {
			$set: {
				text,
				images,
				visibility,
				updatedAt: new Date()
			}
		})

		res.json({ success: true })
	} catch (e) {
		next({ status: 500, msg: 'Failed to edit. Please try again later.' })
	}
}

export const deletePost = async (req, res, next) => {
	try {
		const { postId } = req.body
		const { user } = req

		if (!postId) return next({ status: 400, msg: 'Post id not provided' })

		if (!mongoose.isValidObjectId(postId))
			return next({ status: 400, msg: 'Invalid post id' })

		const post = await Post.findById(postId)

		if (!post)
			return next({ status: 404, msg: 'Post does not exist' })

		if (!post.creator.equals(user._id))
			return next({ status: 403, msg: 'You can delete only your posts' })

		const images = post.images || []
		for (const url of images) {
			try {
				const parts = url.split('/')
				const uploadIndex = parts.findIndex(p => p === 'upload')
				if (uploadIndex === -1) {
					continue
				}

				const publicIdParts = parts.slice(uploadIndex + 2)
				const lastPart = publicIdParts.pop()
				const fileName = lastPart.substring(0, lastPart.lastIndexOf('.'))
				publicIdParts.push(fileName)
				const publicId = publicIdParts.join('/')
				await cloudinary.uploader.destroy(publicId)

			} catch (e) {}
		}

		await Post.deleteOne({ _id: postId })
		await Comment.deleteMany({ postId })
		await Reply.deleteMany({ postId })
		await Notification.deleteMany({ 'payload.postId': postId })

		const viewersKey = `viewers:${postId}`
		const viewers = await redis.smembers(viewersKey)

		for (const viewerId of viewers) {
			await redis.srem(`history:${viewerId}`, postId)
		}

		await redis.del(viewersKey)

		return res.json({ success: true })
	} catch (e) {
		next({ msg: 'Failed to delete post. Please try again later' })
	}
}

export const getUserPosts = async (req, res, next) => {
	try {
		const username = normalizeText(req.query.username || '')
		const page = Number(req.query.page) || 1
		const limit = 30
		const skip = (page - 1) * limit
		const sort = req.query.sortBy === 'oldest' ? 1 : -1

		if (!username?.trim()) {
			return next({ status: 400, msg: 'Username not provided' })
		}

		const user = await User.findOne({ username }, { _id: 1 })
		if (!user) {
			return next({ status: 404, msg: 'User not found' })
		}

		const isOwner = req.user?._id?.toString() === user._id.toString()
		const visibilityConditions = [{ visibility: 'public' }]

		if (isOwner) {
			visibilityConditions.push({ visibility: { $in: ['private', 'followers'] } })
		} else {
			const requester = await User.findById(req.user._id).select('following')
			const isFollowing = requester?.following?.some(id => id.toString() === user._id.toString())
			if (isFollowing) {
				visibilityConditions.push({ visibility: 'followers' })
			}
		}

		const query = {
			creator: user._id,
			$or: visibilityConditions
		}

		const posts = await Post.find(query)
			.populate('creator', 'avatar username')
			.skip(skip)
			.limit(limit)
			.sort({ createdAt: sort })
			.lean()

		const totalPosts = await Post.countDocuments(query)
		const totalPages = Math.ceil(totalPosts / limit)


		let likedSet = new Set()
		if (req.user?._id) {
			const currentUser = await User.findById(req.user._id).select('liked')
			if (currentUser?.liked?.length) {
				likedSet = new Set(currentUser.liked.map(id => id.toString()))
			}
		}

		for (const post of posts) {
			post.liked = likedSet.has(post._id.toString())
		}

		return res.json({
			success: true,
			posts,
			page,
			limit,
			length: posts.length,
			totalPosts,
			totalPages
		})
	} catch (e) {
		return next({ status: 500, msg: 'Failed to fetch user posts' })
	}
}

export const postComment = async (req, res, next) => {
	try {
		let { postId, text } = req.body
		const { user } = req
		const io = req.app.get('io')
		const onlineUsers = io.onlineUsers

		if (!user.verified) return next({ status: 401, msg: 'Please verify your email to comment' })
		if (!postId) return next({ status: 400, msg: 'Post id not provided' })

		text = sanitizeText(text?.trim()?.slice(0, 120))
		if (!text) return next({ status: 400, msg: 'Text is required' })
		
		if (!mongoose.isValidObjectId(postId))
			return next({ status: 400, msg: 'Invalid post id' })

		const post = await Post.findById(postId)
		if (!post) return next({ status: 404, msg: 'Post not found' })

		const isOwner = String(post.creator) === String(user._id)

		// Permission checks
		if (post.visibility === 'private' && !isOwner) {
			return next({ status: 403, msg: 'You cannot comment on a private post' })
		}

		if (post.visibility === 'followers' && !isOwner) {
			const isFollowing = await User.exists({ _id: user._id, following: post.creator })
			if (!isFollowing) {
				return next({ status: 403, msg: 'Only followers can comment on this post' })
			}
		}

		const newComment = await Comment.create({
			userId: user._id,
			text,
			postId
		})
		
		await Post.updateOne({ _id: postId }, {
			$inc: { comments: 1 }
		})
		
		if (!isOwner) await Notification.create({
			type: 'comment',
			message: `New comment from @${user.username.toUpperCase()}`,
			payload: {
				commentId: newComment._id,
				postId,
				sender: user.avatar
			},
			receiver: [post.creator]
		})
		
		const creatorSocket = onlineUsers.get(post.creator.toString())
		
		if (creatorSocket && !post.creator.equals(user._id)) {
			io.to(creatorSocket).emit('notification', {
				type: 'comment',
				message: `New comment from @${user.username.toUpperCase()}`,
				payload: {
					commentId: newComment._id,
					postId,
					sender: user.avatar
				},
			})
		}
	
		return res.status(201).json({ success: true, msg: 'Comment posted' })
	} catch (e) {
		return next({ status: 500, msg: 'Failed to post your comment' })
	}
}

export const getComments = async (req, res, next) => {
	try {
		const { postId } = req.query
		const { user } = req
		const page = Number(req.query.page) || 1
		const limit = 30
		const skip = (page - 1) * limit

		if (!postId)
			return next({ status: 400, msg: 'Post id not provided' })

		if (!mongoose.isValidObjectId(postId))
			return next({ status: 400, msg: 'Invalid post id' })

		const post = await Post.findById(postId)
		if (!post)
			return next({ status: 404, msg: 'Post not found' })

		const isOwner = String(post.creator) === String(user._id)

		if (post.visibility === 'private' && !isOwner)
			return next({ status: 403, msg: 'This post is private' })

		if (post.visibility === 'followers' && !isOwner) {
			const isFollowing = await User.exists({
				_id: user._id,
				following: post.creator
			})
			if (!isFollowing)
				return next({ status: 403, msg: 'Only followers can see the comments' })
		}

		const totalComments = await Comment.countDocuments({ postId })
		const totalPages = Math.ceil(totalComments / limit)

		const comments = await Comment.aggregate([
			{ $match: { postId: new mongoose.Types.ObjectId(postId) } },
			{
				$addFields: {
					isUser: { $eq: ["$userId", user._id] }
				}
			},
			{ $sort: { isUser: -1, createdAt: -1 } },
			{ $skip: skip },
			{ $limit: limit },
			{
				$lookup: {
					from: 'users',
					localField: 'userId',
					foreignField: '_id',
					as: 'user'
				}
			},
			{ $unwind: '$user' },
			{
				$project: {
					_id: 1,
					text: 1,
					replyCount: 1,
					createdAt: 1,
					userId: 1,
					'user.avatar': 1,
					'user.username': 1
				}
			}
		])

		return res.json({
			success: true,
			comments,
			page,
			limit,
			length: comments.length,
			totalComments,
			totalPages
		})
	} catch (e) {
		return next({ status: 500, msg: 'Failed to fetch comments' })
	}
}

export const editComment = async (req, res, next) => {
	try {
		const { commentId, text } = req.body
		const { user } = req

		if (!commentId || typeof text !== 'string')
			return next({ status: 400, msg: 'Invalid data provided' })

		const comment = await Comment.findOne({ _id: commentId })

		if (!comment)
			return next({ status: 404, msg: 'Comment does not exist' })

		if (comment.userId?.toString() !== user._id.toString())
			return next({ status: 403, msg: 'You can edit only your comment' })

		const sanitizedText = sanitizeText(text.trim()?.slice(0, 120))

		if (!sanitizedText)
			return next({ status: 400, msg: 'Comment text cannot be empty' })

		comment.text = sanitizedText
		await comment.save()

		return res.json({ success: true, comment })
	} catch (e) {
		next({ msg: 'Failed to edit comment. Please try again later' })
	}
}

export const deleteComment = async (req, res, next) => {
	try {
		const { commentId } = req.body
		const { user } = req
		
		if (!commentId) return next({ status: 400, msg: 'Comment id not provided' })
		
		const comment = await Comment.findOne({ _id: commentId })
		
		if (!comment) return next({ status: 404, msg: 'Comment does not exist' })
		
		if (comment.userId?.toString() !== user._id.toString()) return next({ status: 403, msg: 'You can delete only your comment' })
		
		await Comment.deleteOne({ _id: commentId })
		await Notification.deleteOne({ 'payload.commentId': commentId })
		await Reply.deleteMany({ commentId })
		
		return res.json({ success: true })
	} catch (e) {
		next({ msg: 'Failed to delete comment. Please try again later' })
	}
}

export const postReply = async (req, res, next) => {
	try {
		let { commentId, text, postId } = req.body
		const { user } = req
		const io = req.app.get('io')
		const onlineUsers = io.onlineUsers

		if (!user.verified) return next({ status: 401, msg: 'Please verify your email to reply' })
		if (!commentId) return next({ status: 400, msg: 'Comment id not provided' })
		if (!postId) return next({ status: 400, msg: 'Post id not provided' })
		
		if (!mongoose.isValidObjectId(postId))
			return next({ status: 400, msg: 'Invalid post id' })
			
			if (!mongoose.isValidObjectId(commentId))
			return next({ status: 400, msg: 'Invalid comment id' })

		text = sanitizeText(text?.trim()?.slice(0, 120))
		if (!text) return next({ status: 400, msg: 'Text is required' })
		const post = await Post.findById(postId)
		const comment = await Comment.findById(commentId)
		if (!post) return next({ status: 404, msg: 'Post not found' })
		if (!comment) return next({ status: 404, msg: 'Comment not found' })

		const newReply = await Reply.create({
			userId: user._id,
			text,
			commentId,
			postId
		})
		await Notification.create({
			type: 'reply',
			message: `Reply from @${user.username.toUpperCase()}`,
			payload: {
				commentId,
				replyId: newReply._id,
				postId
			},
			receiver: [post.creator, user._id]
		})
		await Comment.updateOne({ _id: commentId }, {
			$inc: { replyCount: 1 }
		})
		await Post.updateOne({ _id: postId }, {
			$inc: { comments: 1 }
		})
		
		const commenterSocket = onlineUsers.get(comment.userId?.toString())
		const posterSocket = onlineUsers.get(post.creator.toString())
		
		if (commenterSocket || posterSocket) {
			const payload = {
				type: 'reply',
				message: `Reply from @${user.username.toUpperCase()}`,
				payload: {
				commentId,
				postId,
				sender: user.avatar
			},
			}
			if (!post.creator.equals(user._id)) io.to(posterSocket).emit('notification', payload)
			if (posterSocket === commenterSocket) return
			if (!comment.userId.equals(user._id)) io.to(commenterSocket).emit('notification', payload)
		}

		return res.status(201).json({ success: true, msg: 'Reply posted', newReply: {
			...newReply.toObject(),
			user: {
				avatar: user.avatar,
				username: user.username
				}
			}
		})
	} catch (e) {
		return next({ status: 500, msg: 'Failed to post your reply' })
	}
}

export const getReplies = async (req, res, next) => {
	try {
		const { commentId } = req.query
		const { user } = req
		const page = Number(req.query.page) || 1
		const limit = 30
		const skip = (page - 1) * limit

		if (!commentId) {
			return next({ status: 400, msg: 'Comment id not provided' })
		}

		const comment = await Comment.findById(commentId).lean()
		if (!comment) {
			return next({ status: 404, msg: 'Comment not found' })
		}

		const post = await Post.findById(comment.postId).lean()
		if (!post) {
			return next({ status: 404, msg: 'Post not found' })
		}

		const replies = await Reply.aggregate([
			{ $match: { commentId: new mongoose.Types.ObjectId(commentId) } },
			{
				$addFields: {
					priority: {
						$cond: [
							{
								$in: [
									"$userId",
									[
										new mongoose.Types.ObjectId(user._id),
										new mongoose.Types.ObjectId(post.userId)
									]
								]
							},
							0,
							1
						]
					}
				}
			},
			{ $sort: { priority: 1, createdAt: -1 } },
			{ $skip: skip },
			{ $limit: limit },
			{
				$lookup: {
					from: 'users',
					localField: 'userId',
					foreignField: '_id',
					as: 'user'
				}
			},
			{ $unwind: '$user' },
			{
				$project: {
					text: 1,
					createdAt: 1,
					_id: 1,
					commentId: 1,
					userId: 1,
					user: {
						username: '$user.username',
						avatar: '$user.avatar'
					}
				}
			}
		])

		const totalReplies = await Reply.countDocuments({ commentId })
		const totalPages = Math.ceil(totalReplies / limit)

		return res.json({
			success: true,
			replies,
			page,
			limit,
			length: replies.length,
			totalReplies,
			totalPages
		})
	} catch (e) {
		return next({ status: 500, msg: 'Failed to fetch replies' })
	}
}

export const deleteReply = async (req, res, next) => {
	try {
		const { replyId } = req.body
		const { user } = req
		
		if (!replyId) return next({ status: 400, msg: 'Reply id not provided' })
		
		if (!mongoose.isValidObjectId(replyId))
			return next({ status: 400, msg: 'Invalid reply id' })
		
		const reply = await Reply.findOne({ _id: replyId })
		
		if (!reply) return next({ status: 404, msg: 'Reply does not exist' })
		
		if (reply.userId?.toString() !== user._id.toString()) return next({ status: 403, msg: 'You can delete only your reply' })
		
		await Reply.deleteOne({ _id: replyId })
		await Notification.deleteOne({ 'payload.replyId': replyId })
		
		return res.json({ success: true })
	} catch (e) {
		next({ msg: 'Failed to delete reply. Please try again later' })
	}
}

export const editReply = async (req, res, next) => {
	try {
		const { replyId, text } = req.body
		const { user } = req

		if (!replyId || typeof text !== 'string')
			return next({ status: 400, msg: 'Invalid data provided' })

		if (!mongoose.isValidObjectId(replyId))
			return next({ status: 400, msg: 'Invalid reply id' })

		const reply = await Reply.findById(replyId)
		if (!reply)
			return next({ status: 404, msg: 'Reply not found' })

		if (reply.userId?.toString() !== user._id.toString())
			return next({ status: 403, msg: 'You can edit only your reply' })

		const sanitizedText = sanitizeText(text.trim().slice(0, 120))
		if (!sanitizedText)
			return next({ status: 400, msg: 'Reply text cannot be empty' })

		reply.text = sanitizedText
		await reply.save()

		return res.json({ success: true, msg: 'Reply updated', reply })
	} catch (e) {
		next({ msg: 'Failed to edit reply. Please try again later' })
	}
}

export const getFeed = async (req, res, next) => {
	try {
		const { user } = req
		const page = Number(req.query.page) || 1
		const limit = 30
		const skip = (page - 1) * limit

		const myInfo = await User.findById(user._id).select('following hiddenUsers liked')
		const history = await redis.smembers(`history:${user._id}`) || []

		const posts = await Post.find({
			_id: { $nin: history },
			creator: { $nin: [...myInfo.hiddenUsers, user._id] },
			$or: [
				{ visibility: 'public' },
				{
					$and: [
						{ visibility: 'followers' },
						{ creator: { $in: myInfo.following } }
					]
				}
			]
		})
		.populate('creator', 'avatar username')
		.skip(skip)
		.limit(limit)
		.lean()

		const likedSet = new Set(myInfo.liked.map(id => id.toString()))

		const shuffled = lodash.shuffle(posts).map(post => ({
			...post,
			liked: likedSet.has(post._id.toString())
		}))

		return res.json({
			success: true,
			posts: shuffled,
			page,
			limit,
			length: shuffled.length,
		})
	} catch (e) {
		return next({ msg: 'Failed to fetch your feed' })
	}
}

export const addViewHistory = async (req, res, next) => {
	try {
		const { user } = req
		const { postId } = req.body

		if (!postId)
			return res.status(400).json({ success: false, msg: 'Post ID is required' })

		const historyKey = `history:${user._id}`
		const viewersKey = `viewers:${postId}`

		const alreadyExists = await redis.sismember(historyKey, postId)

		if (!alreadyExists) {
			await redis.sadd(historyKey, postId)
			await redis.sadd(viewersKey, user._id)
		}

		return res.json({ success: true })
	} catch (e) {
		return next({ msg: 'Failed to update view history' })
	}
}