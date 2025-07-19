import { Router } from 'express'
import {
	post,
	getSinglePost,
	editPost,
	likePost,
	getUserPosts,
	deletePost,
	addViewHistory,
	getFeed,
	postComment,
	editComment,
	getComments,
	deleteComment,
	postReply,
	editReply,
	getReplies,
	deleteReply,
} from '../controllers/post.controller.js'
import protectRoute 
from '../middlewares/protectRoute.middleware.js'
import {
	rateLimiter
} from '../middlewares/requestLimiter.middleware.js'




const router = Router()

router.use(protectRoute)


router.route('/post')
.post(rateLimiter, post)
.delete(deletePost)
.put(editPost)

router.get('/singlePost/:postId', getSinglePost)

router.post('/viewHistory', addViewHistory)

router.get('/feed', getFeed)

router.route('/comment')
.post(postComment)
.get(getComments)
.delete(deleteComment)
.put(editComment)

router.route('/reply')
.post(postReply)
.get(getReplies)
.delete(deleteReply)
.put(editReply)

router.post('/like', likePost)
router.get('/userPosts', getUserPosts)





export default router;