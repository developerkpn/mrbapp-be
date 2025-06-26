const jwt = require("jsonwebtoken");

const AuthToken = async (req, res, next) => {
  let headers = req.headers.Authorization || req.headers.authorization;
  console.log(req.headers, "headers");

  // Check if authorization header exists
  if (!(req.headers.authorization || req.headers.Authorization)) {
    return res.status(401).send({
      message: "Access Denied",
    });
  }

  let token = headers?.split(" ")[1];
  let decode;

  try {
    if (token !== undefined) {
      decode = jwt.verify(token, process.env.SECRETJWT);
    } else {
      return res.status(401).send({
        message: "Unauthorized - Invalid token format",
      });
    }
    req.useridSess = decode.id_user;
    console.log(decode.id_user, "userId");
    next();
  } catch (err) {
    if (err.name == "TokenExpiredError") {
      res.status(403).send({
        message: err.message,
      });
    } else if (err.name == "JsonWebTokenError") {
      res.status(401).send({
        message: "Unauthorized - Invalid token",
      });
    } else {
      res.status(500).send({
        message: err.stack,
      });
    }
  }
};

module.exports = AuthToken;
