import { Router } from 'express'
import registerValidator from '../validators/auth.validator.js'
import validate from '../middlewares/validateAuth.middleware.js'
import { loginRateLimiter as rateLimiter }
from '../middlewares/requestLimiter.middleware.js'
import {
	register,
	login,
	logout,
	checkUsername,
	resendVerificationToken as resendToken,
	sendResetMail,
	resetPassword,
	verifyToken,
	verify2Fa,
	checkOtpRequester,
	enable2Fa,
	disable2Fa,
} from '../controllers/auth.controller.js'
import protectRoute
from '../middlewares/protectRoute.middleware.js'




const router = Router()

router.post(
	'/register',
	registerValidator,
	validate,
	register
	)
router.post('/resend-token', protectRoute, resendToken)
router.post('/verify-token', protectRoute, verifyToken)
router.post('/verify-2fa', verify2Fa)
router.get('/checkOtpRequester', checkOtpRequester)
router.post('/sendResetMail', sendResetMail)
router.post('/resetPassword', resetPassword)
router.post('/login', rateLimiter, login)
router.post('/logout', logout)
router.post('/checkUsername', checkUsername)

router.route('/2fa')
.post(protectRoute, enable2Fa)
.delete(protectRoute, disable2Fa)

export default router