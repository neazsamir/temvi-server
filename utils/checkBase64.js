export const checkBase64 = (str) => {
	return typeof str === 'string' && /^data:image\/(jpeg|jpg|png|webp);base64,/.test(str)
}