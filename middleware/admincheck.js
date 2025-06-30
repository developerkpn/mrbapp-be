const AdminCheck = async (req, res, next) => {
  try {
    const roleidSess = req.roleidSess;
    console.log(roleidSess, "roleidSess");
    if (roleidSess !== "43dba1a3-e595-4f0b-aaa8-9f33b28caf51") {
      // admin role_id
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = AdminCheck;
