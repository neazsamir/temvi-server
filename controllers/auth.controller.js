import User from '../models/userSchema.js'
import Notification from '../models/notificationSchema.js'
import argon2 from 'argon2'
import {
	getAttempts,
	incrementAttempts,
	resetAttempts
} from '../utils/attemptsCounter.js';
import createVerificationToken
from '../helpers/createVerificationToken.js'
import mongoose, {isValidObjectId} from 'mongoose'
import sendMail from '../utils/mailSender.js'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'
import crypto from 'crypto'
import Verification
from '../models/verificationSchema.js'
import redis from '../utils/redis.js'
import jwt from 'jsonwebtoken'
import normalizeText from '../utils/normalizeText.js'


export const register = async (req, res, next) => {
	const session = await mongoose.startSession()
	
	const abortAndEnd = async () => {
		await session.abortTransaction()
		session.endSession()
	}
	
	try {
		let { email, username, password } = req.body
		email = email?.toLowerCase().trim()
		username = username?.toLowerCase().trim()
		
		if (!email || !username || !password) {
			await session.endSession()
			return next({ status: 400, msg: 'All fields are required' })
		}
		
		session.startTransaction()
		
		const emailExists = await User.findOne({email}).session(session)
		const usernameExists = await User.findOne({username}).session(session)
		
		if (emailExists) return next({ status: 409, msg: 'Email is already in use'})
		if (usernameExists) return next({ status: 409, msg: 'Username is already in use'})
		
		const newUser = await User.create([{
			username,
			email,
			password: await argon2.hash(password)
		}], { session })
		
		const user = newUser[0].toObject()
		delete user.password
		user.followers = user.followers?.length
		user.following = user.following?.length
		
		const isProductionV = process.env.NODE_ENV === 'production'
		
		const verificationToken = await createVerificationToken(user, session)
		const __filename = fileURLToPath(import.meta.url)
		const __dirname = path.dirname(__filename)
		let template = await readFile(path.join(__dirname, '../templates/emailVerification.html'), 'utf-8')
		const now = new Date()
		const verificationLink = `https://temvi.netlify.app/verify/email?token=${verificationToken}`
		
		template = template
		?.replaceAll('{{username}}', username.toUpperCase())
		?.replaceAll('{{verification_link}}', verificationLink)
		?.replaceAll('{{support_email}}', process.env.SUPPORT_EMAIL || 'temvi@gmail.com')
		?.replaceAll('{{year}}', now.getFullYear())
		
		await sendMail(
			email,
			'Temvi account verification',
			template,
			)
		
		
		res.cookie('jwt', await newUser[0].generateToken(), {
			maxAge: 7 * 24 * 60 * 60 * 1000,
			httpOnly: true,
			sameSite: isProductionV ? 'none' : 'strict',
			secure: isProductionV,
			path: '/'
		})
		
		await session.commitTransaction()
		session.endSession()
		
		return res.status(201).json({ success: true, msg: "Account created", newUser: user })
	} catch (e) {
		await abortAndEnd()
		console.log('Error registering user: ', e)
		next(e)
	}
}

export const resendVerificationToken = async (
	req, res, next
	) => {
	try {
		const { user } = req
		const verificationToken = await createVerificationToken(user)
		const __filename = fileURLToPath(import.meta.url)
		const __dirname = path.dirname(__filename)
		let template = await readFile(path.join(__dirname, '../templates/emailVerification.html'), 'utf-8')
		const now = new Date()
		const verificationLink = `https://temvi.netlify.app/verify/email?token=${verificationToken}`
		
		template = template
		?.replaceAll('{{username}}', user.username.toUpperCase())
		?.replaceAll('{{verification_link}}', verificationLink)
		?.replaceAll('{{support_email}}', process.env.SUPPORT_EMAIL || 'temvi@gmail.com')
		?.replaceAll('{{year}}', now.getFullYear())
		
		await sendMail(
			user.email,
			'Temvi account verification',
			template,
			)
		
		return res.json({ success: true, msg: 'Verification link sent. Please check your email inbox.' })
	} catch (e) {
		console.log('Error resending verification token: ', e)
		next(e)
	}
}

export const verifyToken = async (req, res, next) => {
	try {
		const { user } = req
		const { token } = req.query
		const now = new Date()
		
		if (user.verified) return next({ status: 400, msg: 'Your account is already verified' })
		
		const attempts = await getAttempts('failedVerification', user.email)
		const lockTime = 60 * 60 * 6
		
		if (attempts >= 50) return next({ status: 429, msg: 'Too many failed verification attempts. Please try again in 6 hours.' })
		
		if (!token) {
			await incrementAttempts('failedVerification', user.email, lockTime)
			return next({ status: 400, msg: 'Verification token not provided' }) 
		}
		
		let tokenExists = await Verification.findOne({
			requester: user.email
		})
		
		if (tokenExists && (now - tokenExists.createdAt > 10 * 60 * 1000)) {
			await Verification.deleteOne({requester: user.email})
			tokenExists = null
		}
		
		if (!tokenExists || token !== tokenExists?.token) {
			await incrementAttempts('failedVerification', user.email, lockTime)
			return next({ status: 400, msg: 'Invalid or expired token' })
		}
		
		await User.updateOne({_id: user._id}, {
			$set: { verified: true }
		})
		
		await Verification.deleteOne({requester: user.email})
		
		const __filename = fileURLToPath(import.meta.url)
		const __dirname = path.dirname(__filename)
		let template = await readFile(path.join(__dirname, '../templates/verificationConfirmation.html'), 'utf-8')
		
		template = template
		?.replaceAll('{{username}}', user.username.toUpperCase())
		?.replaceAll('{{support_email}}', process.env.SUPPORT_EMAIL || 'temvi@gmail.com')
		?.replaceAll('{{year}}', now.getFullYear())
		
		await sendMail(
			user.email,
			'Temvi account verified',
			template,
			)
		
		return res.json({ success: true, msg: 'Email verification successful'})
		
	} catch (e) {
		console.log('Error verifying token:', e)
		next(e)
	}
}

export const login = async (req, res, next) => {
	try {
		const dummyHash = '$argon2id$v=19$m=65536,t=2,p=1$ZHVtbXlsaW1pdA$ZHVtbXl2YWx1ZWhhc2g'; // to prevent timing attacks
		const isProductionV = process.env.NODE_ENV === 'production'
		
		let { email, password } = req.body
		email = email?.toLowerCase().trim()
		
		if (!email) return next({ status: 400, msg: "Email is required" })
		if (!password) return next({ status: 400, msg: "Password is required" })
		
		
		const attempts = await getAttempts('failedLogin', email)
		
		if (attempts >= 10) return next({ status: 429, msg: "Too many failed login attempts. Try again in 24 hours."})
		
		const userExists = await User.findOne({email}, {liked: 0})
		const passwordCorrect = await argon2.verify(userExists?.password || dummyHash, password)
		
		
		if (!userExists || !passwordCorrect) {
			const lockTime = 60 * 60 * 24
			await incrementAttempts('failedLogin', email, lockTime)
			return next({ status: 400, msg: "Incorrect email or password" })
		}
		
		await resetAttempts('failedLogin', email)
		
		
		const user = userExists.toObject()
		
		if (user._2fa) {
			const otp = (crypto.randomInt(100000, 1000000)).toString()
			const __filename = fileURLToPath(import.meta.url)
			const __dirname = path.dirname(__filename)
			let template = await readFile(path.join(__dirname, '../templates/otpVereification.html'), 'utf-8')
			const now = new Date()
			
			template = template
			?.replaceAll('{{username}}', user.username.toUpperCase())
			?.replaceAll('{{otp_code}}', otp)
			?.replaceAll('{{support_email}}', process.env.SUPPORT_EMAIL || 'support@temvi.com')
			?.replaceAll('{{year}}', now.getFullYear())
			await redis.set(`2fa:${user._id}`, otp, 'EX', 600)
			await sendMail(
				user.email,
				'Temvi account 2FA verification',
				template,
			)
			const encrypted_context = jwt.sign({
				userId: user._id,
				userAgent: req.get('user-agent'),
				ip: req.ip
			}, process.env.JWT_SECRET, { expiresIn: '10m' })
			
			res.cookie('_2fa', encrypted_context, {
			maxAge: 10 * 60 * 1000,
			httpOnly: true,
			sameSite: isProductionV ? 'none' : 'strict',
			secure: isProductionV,
			path: '/'
		})
			
			return res.status(401).json({ success: false, msg: '2-Step verification required'})
		}
		
		const notifications = await Notification.find({ receiver: user._id }).sort({ createdAt: -1 }).select('-reciever').lean()
		
		delete user.password
		delete user.hiddenUsers
		user.followers = user.followers?.length
		user.following = user.following?.length
		user.notifications = notifications
		
		res.cookie('jwt', await userExists.generateToken(), {
			maxAge: 7 * 24 * 60 * 60 * 1000,
			httpOnly: true,
			sameSite: isProductionV ? 'none' : 'strict',
			secure: isProductionV,
			path: '/'
		})
		return res.json({ success: true, msg: `Welcome back @${user.username.toUpperCase()}`, user })
		
	} catch (e) {
		console.log('Error logging-in user: ', e)
		next(e)
	}
}

export const verify2Fa = async (req, res, next) => {
	try {
	const otp = Number(req.body.otp)
	const encrypted_context = req.cookies._2fa
	const isProductionV = process.env.NODE_ENV === 'production'
	
	if (!encrypted_context) return next({ status: 400, msg: 'Session expired' })
	
	if (!otp) return next({ status: 400, msg: 'OTP is required' })
	
	const data = jwt.verify(encrypted_context, process.env.JWT_SECRET)
	
	if (!data) return next({ status: 400, msg: 'Invalid or expired token. Please login again' })
	
	if (req.ip !== data.ip || req.get('user-agent') !== data.userAgent) return next({ status: 403, msg: 'Device or IP changed. Please login again' })

	const user = await User.findById(data.userId)
	
	if (!user) return next({ status: 404, msg: 'User does not exist' })
	
	const attempts = await getAttempts('failed2Fa', user.email)
	
	if (attempts >= 10) return next({ status: 403, msg: 'Too many failed attempts. Please try again in 12 hours' })
	
	const storedOtp = await redis.get(`2fa:${user._id}`)
	
	if (!storedOtp) return next({ status: 404, msg: 'OTP expired. Please login again' })
	
	if (otp !== Number(storedOtp)) {
		await incrementAttempts('failed2Fa', user.email, 60 * 60 * 12)
		return next({ status: 400, msg: 'Invalid OTP' })
	}
	
	await redis.del(`2fa:${data.userId}`)
	
	
	const userObj = user.toObject()
	
	const notifications = await Notification.find({ receiver: userObj._id }).sort({ createdAt: -1 }).select('-reciever').lean()

	delete userObj.password
	delete userObj.hiddenUsers
	userObj.followers = userObj.followers?.length
	userObj.following = userObj.following?.length
	user.notifications = notifications
	
	res.cookie('_2fa', '', { maxAge: 0 })
	res.cookie('jwt', await user.generateToken(), {
		maxAge: 7 * 24 * 60 * 60 * 1000,
		httpOnly: true,
		sameSite: isProductionV ? 'none' : 'strict',
		secure: isProductionV,
		path: '/'
	})
	
	return res.json({ success: true, msg: `Welcome back, @${userObj.username?.toUpperCase()}`, user: userObj })
	} catch (e) {
		console.log('Error verifying 2fa', e)
		return next(e)
	}
}

export const logout = async (req, res, next) => {
	try {
		res.cookie('jwt', '', { maxAge: 0 })
		return res.json({ success: true, msg: 'Logged out' })
	} catch (e) {
		console.log('Error logging-out user: ', e)
		next(e)
	}
}

export const enable2Fa = async (req, res, next) => {
	try {
		await User.updateOne({ _id: req.user._id }, {
			$set: { _2fa: true }
		})
		
		return res.json({ success: true })
	} catch (e) {
		console.log('Error enabling 2fa', e)
		return next({ msg: 'Failed to enable 2FA' })
	}
}

export const disable2Fa = async (req, res, next) => {
	try {
		
		const { password } = req.body
		const user = await User.findById(req.user._id).select('password _2fa')
		
		if (!user._2fa) return next({ status: 400, msg: '2FA is already disabled' })
		
		const passwordCorrect = await argon2.verify(user.password, password)
		
		if (!passwordCorrect) return next({ status: 403, msg: 'Incorrect password' })
		
		await User.updateOne({ _id: req.user._id }, {
			$set: { _2fa: false }
		})
		
		return res.json({ success: true })
	} catch (e) {
		console.log('Error disabling 2fa', e)
		return next({ msg: 'Failed to disable 2FA' })
	}
}

export const checkUsername = async (req, res, next) => {
	try {
		const username = normalizeText(req.body.u)
		const usernameExists = await User.exists({ username })
		
		if (usernameExists) return next({ status: 409, msg: "Username already exists", extraDetails: { exists: true }})
		else return res.json({ success: true, exists: false })
	} catch (e) {
		console.log("Error checking username", e)
		next(e)
	}
}

export const checkOtpRequester = async (req, res, next) => {
	try {
		const token = req.cookies._2fa
		
		if (!token) return next({ status: 404, msg: 'Session expired. Please login again' })
		
		const data = jwt.verify(token, process.env.JWT_SECRET)
		if (!data) return next({ status: 403, msg: 'Invalid session token' })
		
		const userExists = await User.exists({ _id: data.userId })
		
		if (!userExists) return next({ status: 403, msg: 'Invalid session token' })
		
		return res.json({ success: true })
	} catch (e) {
		console.log('Error checking otp requester: ', e)
		next(e)
	}
}

export const sendResetMail = async (req, res, next) => {
	try {
		const { email } = req.body
		const user = await User.findOne({ email }).select('username email')

		if (!user) {
			return res.status(404).json({ success: false, msg: 'User not found with this email.' })
		}

		const resetToken = crypto.randomBytes(32).toString('hex')

		await redis.setex(`reset:${resetToken}`, 600, user._id.toString())

		const __filename = fileURLToPath(import.meta.url)
		const __dirname = path.dirname(__filename)
		let template = await readFile(path.join(__dirname, '../templates/resetPassword.html'), 'utf-8')

		const now = new Date()
		const resetLink = `https://temvi.netlify.app/reset?token=${resetToken}`

		template = template
			?.replaceAll('{{username}}', user.username.toUpperCase())
			?.replaceAll('{{reset_link}}', resetLink)
			?.replaceAll('{{support_email}}', process.env.SUPPORT_EMAIL || 'temvi@gmail.com')
			?.replaceAll('{{year}}', now.getFullYear())

		await sendMail(
			user.email,
			'Reset your Temvi password',
			template
		)

		return res.json({ success: true, msg: 'Password reset link sent. Please check your email inbox.' })
	} catch (e) {
		console.log('Error sending reset mail: ', e)
		next(e)
	}
}

export const resetPassword = async (req, res, next) => {
	try {
		const { token, newPassword } = req.body

		// Input validation
		if (!token || typeof token !== 'string') {
			return res.status(400).json({ success: false, msg: 'Reset token is required.' })
		}

		if (!newPassword || typeof newPassword !== 'string') {
			return res.status(400).json({ success: false, msg: 'Password is required.' })
		}

		if (newPassword.length < 8) {
			return res.status(400).json({ success: false, msg: 'Password must be at least 8 characters long.' })
		}

		const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()[\]{}:;'",.?/~`_|\\+=-]).{8,}$/
		if (!passwordRegex.test(newPassword)) {
			return res.status(400).json({
				success: false,
				msg: 'Password must include uppercase, lowercase, number, and special character.'
			})
		}

		const userId = await redis.get(`reset:${token}`)
		if (!userId || !isValidObjectId(userId)) {
			return res.status(400).json({ success: false, msg: 'Invalid or expired token.' })
		}

		const user = await User.findById(userId)
		if (!user) {
			return res.status(404).json({ success: false, msg: 'User not found.' })
		}

		const hashedPassword = await argon2.hash(newPassword)
		user.password = hashedPassword
		await user.save()

		await redis.del(`reset:${token}`)

		return res.json({ success: true, msg: 'Password has been reset successfully.' })
	} catch (e) {
		console.error('Error resetting password:', e)
		next(e)
	}
}
