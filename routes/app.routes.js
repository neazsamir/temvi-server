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
	updateVibes,
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

router.use(protectRoute)

router.put('/avatar', upload.single('file'), updateAvatar)
router.put('/cover', updateCover)
router.put('/vibes', updateVibes)
router.get('/photos', getPhotos)

router.route('/visitors')
.post(addVisitor)
.get(getVisitors)

router.get('/search', search)
router.route('/searchHistory')
.post(setSearchHistory)
.get(getSearchHistory)
.delete(deleteSearchHistory)

router.post('/follow', follow)
router.delete('/unfollow', unfollow)
router.patch('/toggleHideUser', toggleHideUser)
router.get('/myData', getMyData)
router.get('/followingList', followingList)
router.get('/userData/:username', getUserData)
router.put('/bio', updateBio)

router.route('/notification')
.get(getNotification)
.delete(deleteNotification)


export default router;