import transporter from '../lib/transporter.js'

const sendMail = async (to, subject, html) => {
	transporter.sendMail({
  from: `Temvi ${process.env.GMAIL}`,
  to,
  subject,
  html,
	})
}

export default sendMail;