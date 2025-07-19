import redis from './redis.js';

export const getAttempts = async (
	action,
	identifier
	) => {
	const key = `${action}:${identifier}`;
	const attempts = await redis.get(key);
	return attempts ? parseInt(attempts, 10) : 0;
}

export const incrementAttempts = async (
	action,
	identifier, 
	lockTime
	) => {
	const key = `${action}:${identifier}`;
	const attempts = await redis.incr(key);
	if (attempts === 1) {
		await redis.expire(key, lockTime);
	}
	return attempts;
}

export const resetAttempts = async (
	action, identifier
	) => {
	await redis.del(`${action}:${identifier}`);
}