import sanitizeHtml from 'sanitize-html'

const sanitize = (text) => sanitizeHtml(text, {
	allowedTags: [],
	allowedAttributes: {},
})

export default sanitize;