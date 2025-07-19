import express from 'express'
import cors from 'cors'
import connectDB from './lib/db.js'
import authRouter from './routes/auth.routes.js'
import appRouter from './routes/app.routes.js'
import postRouter from './routes/post.routes.js'
import errorMiddleware from './middlewares/error.middleware.js'
import cookieParser from 'cookie-parser'
import { config } from 'dotenv'
import { app, server } from './lib/socket.js'



config()

const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '30mb' }))
app.use(express.urlencoded({ limit: '30mb', extended: true }))
app.use(cors({
	origin: process.env.NODE_ENV === 'development' ? ['http://localhost:8158', 'http://localhost:5173'] : "https://temvi.netlify.app",
	credentials: true
}))
app.use(cookieParser())
app.use(express.json())
app.use('/api/auth', authRouter)
app.use('/api/app', appRouter)
app.use('/api/post', postRouter)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.use(errorMiddleware)


connectDB()
.then(() => server.listen(PORT, () =>
console.log(`Listening on ${PORT}`)))