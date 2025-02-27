import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie:{maxAge: 1000*60*60*24},
  })
);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());


// const db = new pg.Client({
//   user: process.env.PG_USER,
//   host: process.env.PG_HOST,
//   database: process.env.PG_DATABASE,
//   password: process.env.PG_PASSWORD,
//   port: process.env.PG_PORT,
// });
// db.connect();
const config = { 

  user: process.env.USER,
  password: process.env.PASSWORD,
  host: process.env.HOST,
  // port: process.env.PORT,
  port: 21471,
  database: process.env.DATABASE,
  ssl: {
      rejectUnauthorized: true,
      // ca: fs.readFileSync('./ca.pem').toString(),
      ca: process.env.CA,
  },
};
const db = new pg.Client(config);
db.connect();

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/secrets", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("secrets.ejs");
  } else {
    res.redirect("/login");
  }
});

// for google auth registration and request info from google
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

// for google auth success and failure , endpoint for google auth
app.get(
  "/auth/google/secrets",
  passport.authenticate("google", {
    successRedirect: "/secrets",
    failureRedirect: "/login",
  })
);

// app.post(
//   "/login",
//   passport.authenticate("local", {
//     successRedirect: "/secrets",
//     failureRedirect: "/login",
//   })
// );
// 


// send request to login with username and password
app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.render("extra.ejs", { errmessage: "Wrong password or username" });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      return res.redirect("/secrets");
    });
  })
  // Invoke the Middleware
  (req, res, next);
});

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM userbt WHERE email = $1", [
      email,
    ]);
    if (checkResult.rows.length > 0) {
      // res.send("Email already exists. Try logging in.");
      // or
      // req.redirect("/login");
      res.render("extra.ejs",{errmessage:"Email already exists. Try logging in."});
    } else {
      // const hashedPassword = await bcrypt.hash(password, saltRounds);
      bcrypt.hash(password, saltRounds, async function(err, hash) {
        if (err) {
          console.log("not register, Error hashing error:",err);
        }
        else {
          const result = await db.query(
            "INSERT INTO userbt (email, password) VALUES ($1, $2) RETURNING * ;",
            [email, hash]
          );
          // console.log(result.rows);
          // res.render("secrets.ejs");
          // res.send("Registered now logging in.");

          // registered current user info saved in user
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log("success");
            res.redirect("/secrets");
          });

          // better i think
          // res.render("extra.ejs",{errmessage:"Registered, now logging in."});
        }
      }
      );


    }
  } catch (err) {
    console.log(err);
    
  // res.redirect("/");
  res.render("extra.ejs",{errmessage:"error Occur retry."});

  }
  //   if (checkResult.rows.length > 0) {
  //     req.redirect("/login");
  //   } else {
  //     bcrypt.hash(password, saltRounds, async (err, hash) => {
  //       if (err) {
  //         console.error("Error hashing password:", err);
  //       } else {
  //         const result = await db.query(
  //           "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
  //           [email, hash]
  //         );
  //         const user = result.rows[0];
  //         req.login(user, (err) => {
  //           console.log("success");
  //           res.redirect("/secrets");
  //         });
  //       }
  //     });
  //   }
  // } catch (err) {
  //   console.log(err);
  // }
});


// here username password is the name of the input field in the form
// here username and password are the names of the input fields in the login form that here passed as arguments
passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM userbt WHERE email = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false);
            }
          }
        });
      } else {
        // return cb("User not found");
        return cb(null, false);
      }
    } catch (err) {
      console.log(err);
    res.render("extra.ejs",{errmessage:"error Occur retry."});

    }
  })
);

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // if i have a domain i will use it here and in order to hit /auth/google/secrets
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/secrets",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        console.log(profile);
        const result = await db.query("SELECT * FROM userbt WHERE email = $1", [
          profile.email,
        ]);
        // for new user by google auth
        if (result.rows.length === 0) {

          // here i dont  need to save any password as user is redirect or comes here by google auth so to see separate user i will save password as google
          const newUser = await db.query(
            "INSERT INTO userbt (email, password) VALUES ($1, $2)",
            [profile.email, "google"]
          );
          return cb(null, newUser.rows[0]);
        } else {
          return cb(null, result.rows[0]);
        }
      } catch (err) {
        // google signin error
        return cb(err);
      }
    }
  )
);
passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
