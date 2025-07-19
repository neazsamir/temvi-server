import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 20,

	// 💬 Custom response handler
	handler: (req, res, next, options) => {
		return res.status(429).json({
			status: 429,
			success: false,
			msg: "Too many requests. Try again later.",
		});
	},

	standardHeaders: true,
	legacyHeaders: false,
});

export const loginRateLimiter = rateLimit({
	windowMs: 6 * 60 * 60 * 1000,
	max: 15,

	// 💬 Custom response handler
	handler: (req, res, next, options) => {
		return res.status(429).json({
			status: 429,
			success: false,
			msg: "Too many login request. Try again after 6 hours.",
		});
	},

	standardHeaders: true,
	legacyHeaders: false,
});
