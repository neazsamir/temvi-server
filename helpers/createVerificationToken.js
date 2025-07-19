import crypto from 'crypto'
import Verification
from '../models/verificationSchema.js'
import { getAttempts, incrementAttempts }
from '../utils/attemptsCounter.js'



const createVerificationToken = async (requester, session) => {
	try {
		
		const attempts = await getAttempts('verificationTokenCreated', requester.email)
		
		if (requester?.verified) {
			throw { status: 400, msg: 'Your account is already verified' }
		}
		
		if (attempts >= 5) throw { status: 429, msg: 'Resend limit reached. Please try again in 24 hours' }
		
		
		let tokenExists = await Verification.findOne({
			requester: requester.email
		})
		const now = new Date()
		
		if (tokenExists && (now - tokenExists.createdAt > 10 * 60 * 1000)) {
			await Verification.deleteOne({token: tokenExists.token})
			tokenExists = null
		}
		
		let verificationToken = tokenExists?.token || crypto.randomBytes(32).toString('hex')
		const waitTime = 60 * 1000
		
		if (tokenExists && (now - tokenExists?.lastSentAt < waitTime)) {
			const timeLeft = Math.ceil((waitTime - (now - tokenExists?.lastSentAt)) / 1000)
			throw ({ status: 429, msg: `Please try to resend in ${timeLeft} seconds` })
		}
		
		if (tokenExists) await Verification.updateOne({
			token: tokenExists.token,
			requester: tokenExists.requester
		}, { $set: { lastSentAt: now }})
		
		if (!tokenExists) {
		const lockTime = 60 * 60 * 24
			await Verification.create([{
			token: verificationToken,
			requester: requester.email,
		}], { session })
		await incrementAttempts('verificationTokenCreated', requester.email, lockTime)
		}
		
		
		return verificationToken
	} catch (e) {
		console.log(e)
		if (e.code === 11000) throw { status: 409, msg: 'You already sent verification token. Please resend in 10 minutes' }
		else if (e.msg && e.status) throw { msg: e.msg, status: e.status }
		else throw { msg: 'failed to send verification token '}
	}
}

export default createVerificationToken;