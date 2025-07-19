import { createServer } from 'http'
import { Server } from 'socket.io'
import express from 'express'
import { config } from 'dotenv'

config()

const app = express()
const server = createServer(app)

const io = new Server(server, {
  cors: {
    origin:	process.env.CLIENT_DOMAIN
  }
})

io.onlineUsers = new Map()

io.on('connection', (socket) => {

  socket.on('register', (userId) => {
    io.onlineUsers.set(userId?.toString(), socket.id)
  })

  socket.on('disconnect', () => {
    for (const [userId, sockId] of io.onlineUsers.entries()) {
      if (sockId === socket.id) {
        io.onlineUsers.delete(userId)
        break
      }
    }
  })
})

app.set('io', io)

export { app, server, io }