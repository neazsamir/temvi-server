import { Router } from 'express'
import multer from 'multer'
import {
	updateAvatar,
	updateCover,
	getPhotos,
	getVisitors,
	addVisitor,
	getMyData,
	getUserData,
	follow,
	unfollow,
	followingList,
	search,
	toggleHideUser,
	getNotification,
	deleteNotification,
	updateBio,
	setSearchHistory,
	getSearchHistory,
	deleteSearchHistory,
} from '../controllers/app.controller.js'
import protectRoute
from '../middlewares/protectRoute.middleware.js'




const router = Router()
const upload = multer({ dest: 'temp/' })


router.put('/avatar', protectRoute, upload.single('file'), updateAvatar)
router.put('/cover', protectRoute, updateCover)
router.get('/photos', protectRoute, getPhotos)

router.route('/visitors')
.post(protectRoute, addVisitor)
.get(protectRoute, getVisitors)

router.get('/search', protectRoute, search)
router.route('/searchHistory')
.post(protectRoute, setSearchHistory)
.get(protectRoute, getSearchHistory)
.delete(protectRoute, deleteSearchHistory)

router.post('/follow', protectRoute, follow)
router.delete('/unfollow', protectRoute, unfollow)
router.patch('/toggleHideUser', protectRoute, toggleHideUser)
router.get('/myData', protectRoute, getMyData)
router.get('/followingList', protectRoute, followingList)
router.get('/userData/:username', protectRoute, getUserData)
router.put('/bio', protectRoute, updateBio)

router.route('/notification')
.get(protectRoute, getNotification)
.delete(protectRoute, deleteNotification)


export default router;