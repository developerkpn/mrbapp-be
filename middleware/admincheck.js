const AdminCheck = async (req, res, next) => {
  try {
    const { role_id } = req.user;
    if (role_id !== "43dba1a3-e595-4f0b-aaa8-9f33b28caf51") {
      // admin role_id
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = AdminCheck;
