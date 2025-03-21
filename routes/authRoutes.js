const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getProfile,
  updateProfileImage,
  deleteProfileImage,
  getMe,
  updateProfilePicture,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.post("/register", register);
router.post("/login", login);
router.get("/profile", protect, getProfile);
router.post(
  "/profile/image",
  protect,
  upload.single("profileImage"),
  updateProfileImage
);
router.delete("/profile/image", protect, deleteProfileImage);
router.get("/me", protect, getMe);
router.put("/profile-picture", protect, updateProfilePicture);

module.exports = router;
