import { validationResult } from 'express-validator'

const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0];
    return next({ msg: firstError?.msg, status: 400 })
  }

  next();
};

export default validate