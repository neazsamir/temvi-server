## 🧪 Backend — Node.js, Express & MongoDB

The backend of **Temvi** was built with simplicity, performance, and scalability in mind. Using **Node.js**, **Express**, **MongoDB**, and **Socket.io**, the API supports secure authentication, post handling, real-time notifications, and user interaction logic.

### 🛠 Core Technologies

- **Node.js** + **Express** — RESTful API & middleware
- **MongoDB (Mongoose)** — NoSQL database for users, posts, comments
- **JWT** — Secure token-based authentication
- **Nodemailer** — Email verification and 2FA
- **Socket.io** — Real-time notifications
- **Redis** — Temporary storage and caching (mentions, sessions, etc.)

### 🔐 Key Features

- User registration and login (with email verification)
- 2FA system using email-based OTP
- CRUD operations for posts and comments
- Mentioning followers with `@followers`
- Protected posts (Public / Followers / Private)
- Real-time notification system via Socket.io
- Field validation and role-based authorization

### 📚 What I Learned Building It

#### 🔁 Don’t Underestimate Code Reusability

> “At first, I avoided splitting logic into small files. Why extract something that’s just a few lines?”

Early on, I resisted breaking logic into reusable modules, thinking it would just create extra files. But as the project grew — with over **500 lines of code per controller file** — the pain of navigating bloated files hit hard. If I had modularized smaller logic earlier (like OTP handlers, token generators, or file uploads), the code would have been **cleaner, easier to test, and more scalable**.

Now I understand that **maintainability matters more than minimal file count**.

#### ⚡ Redis Was a Game Changer

I didn’t plan to use Redis initially, but I needed a fast, temporary data store — especially for things like:
- OTP session handling
- Recent search history
- Storing profile visitors

Redis provided the performance boost and flexibility I needed, and it’s now a permanent part of my backend toolkit.

#### 🔄 Full Authentication Flow

This was my first time implementing a full-fledged **authentication system** from scratch:
- Account creation with email verification
- Secure password hashing
- JWT-based sessions
- 2FA login with email-based OTP

#### ✉️ Sending Emails with Nodemailer

Learning to integrate email functionality with **Nodemailer** and OTP generation was a key milestone. It added a layer of professionalism and security to the app.

---

> I built this backend not just to "make it work" — but to **understand how real-world systems are structured**. Mistakes became learning opportunities, and every challenge shaped the architecture of Temvi into something I'm truly proud of.