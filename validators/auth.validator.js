import { body } from 'express-validator'

const registerValidator = [
  body('username')
  .notEmpty()
  .withMessage('Username is required')
  .bail()
  .isLength({ min: 4, max: 20 })
  .withMessage('Username must be 4–20 characters long')
  .bail()
  .matches(/^[A-Za-z][A-Za-z0-9]*$/)
  .withMessage('Username must start with a letter and can include numbers only'),
		
		
  body('email')
  	.notEmpty()
  	.withMessage('Email is required')
  	.bail()
    .isEmail()
    .withMessage('Must be a valid email'),

  body('password')
  .notEmpty()
  .withMessage('Password is required')
  .bail()
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters long.')
  .bail()
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()[\]{}:;'",.?/~`_|\\+=-]).{8,}$/)
  .withMessage('Password must include uppercase, lowercase, number, and special character.')
];

export default registerValidator