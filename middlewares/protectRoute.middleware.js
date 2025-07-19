import jwt from 'jsonwebtoken'
import User from '../models/userSchema.js'

const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt

    if (!token) {
      return next({
        status: 401,
        msg: "Please login first",
        extraDetails: { msg: "Token not provided" }
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findOne({ _id: decoded?._id }).select('-password -following -followers -liked -notifications -hiddenUsers')
    if (!user) {
      return next({ status: 401, msg: "User does not exist" })
    }

    req.user = user.toObject()
    next()
  } catch (e) {
    console.log('Error protecting routes:', e)

    if (e.name === 'TokenExpiredError') {
      return next({ status: 401, msg: "Session expired. Please login again." })
    }

    if (e.name === 'JsonWebTokenError') {
      return next({ status: 401, msg: "Invalid token" })
    }

    return next({
      status: 500,
      msg: "Something went wrong",
      extraDetails: { error: e.message }
    })
  }
}

export default protectRoute