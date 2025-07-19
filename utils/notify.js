import User from '../models/userSchema.js'

const notify = async (
	filter,
	message,
	type,
	payload,
	session
	) => {
	try {
		await User.updateOne(filter, {
			$push: {
				notifications: {
					message,
					type,
					payload
				}
			}
		}).session(session)
	} catch (e) {
		console.log('Error notifying user', e)
		throw e
	}
}

export default notify;