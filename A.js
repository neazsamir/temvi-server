import argon2 from "argon2";

async function hashPassword() {
  try {
    const hashed = await argon2.hash("12345678");
    console.log(hashed);
  } catch (err) {
    console.error(err);
  }
}

hashPassword();