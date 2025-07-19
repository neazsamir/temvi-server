const error = (err, req, res, next) => {
	const status = err?.status || 500
	const msg = err?.msg || 'Internal server error'
	const extraDetails = err?.extraDetails || {}
	return res.status(status).json({ success: false, msg, extraDetails })
}

export default error;