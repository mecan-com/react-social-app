const express = require("express");
const app = express();
const compression = require("compression");
const bodyParser = require("body-parser");
const queryFunction = require("./queryFunction");
const chalk = require("chalk");
const { hashPass, checkPass, passRestrictions } = require("./hashFunctions");
const cookieSession = require("cookie-session");

let secrets;
process.env.NODE_ENV === "production"
    ? (secrets = process.env)
    : (secrets = require("./secrets.json"));

app.use(bodyParser.json());
app.use(
    cookieSession({
        secret: secrets.cookieSecret,
        maxAge: 1000 * 60 * 60 * 24 * 14
    })
);

//PURPOSE: VULNERABILITIES
const csurf = require("csurf");
app.use(csurf()); // use after cookie/body middleware, CSRF attack prevention
app.use(function(req, res, next) {
    res.cookie("mytoken", req.csrfToken()); //responds with a cookie "mytoken" for every request done to server
    next();
});
app.use(function(req, res, next) {
    res.setHeader("x-frame-options", "DENY");
    next();
});
app.disable("x-powered-by");
//END VULNERABILITIES

app.use(compression());
app.use(express.static("./public"));

if (process.env.NODE_ENV != "production") {
    app.use(
        "/bundle.js",
        require("http-proxy-middleware")({
            target: "http://localhost:8081/"
        })
    );
} else {
    app.use("/bundle.js", (req, res) => res.sendFile(`${__dirname}/bundle.js`));
}

//////////////////////////////ROUTE RESTRICTIONS///////////////////////////
//////////////////////////////////////////////////////////////////////////
// function checkIfLoggedIn(req, res, next) {
//     console.log("REQ SESSION", req.session);
//     if (!req.session.loggedIn && req.url != "/welcome") {
//         res.redirect("/welcome");
//     } else if (req.session.loggedIn && req.url != "/") {
//         res.redirect("/");
//     } else {
//         next();
//     }
// }
//////////////////////////////ROUTE RESTRICTIONS///////////////////////////
//////////////////////////////////////////////////////////////////////////

// app.get("/", checkLoggedInSession, (req, res) => {
//     res.send("LOG PAGE!"); //userlogo
// });

app.get("/welcome");
// checkIfLoggedIn
app.get("*", function(req, res) {
    res.sendFile(__dirname + "/index.html");
});

app.post("/submit-registration", (req, res) => {
    console.log("SUBMIT REGISTRATION BODY:", req.body);
    hashPass(req.body.password)
        .then(hashedPassword => {
            return queryFunction.createUser(
                req.body.firstname,
                req.body.lastname,
                req.body.email,
                hashedPassword
            );
        })
        .then(useridResponse => {
            console.log(
                "USER ID RESPONSE AFTER CREATING USER",
                useridResponse.rows[0]
            );
            req.session.loggedIn = useridResponse.rows[0]; //sets cookie based on the users ID
            res.json({
                loggedIn: true
            });
        })
        .catch(e => {
            console.log(chalk.red("CREATEUSER/REGISTER ERROR:"), e);
            res.json({
                error: true
            });
        });
});

app.post("/login-check", (req, res) => {
    console.log(req.body);
    queryFunction
        .fetchPassword(req.body.email)
        .then(passwordResponse => {
            console.log("REQ PASSWORD TO COMPARE", req.body.password);
            console.log(
                "PASSWORD RESPONSE AFTER SENDING USER EMAIL TO SQL: ",
                passwordResponse.rows[0]
            );
            return checkPass(
                req.body.password,
                passwordResponse.rows[0].password
            ).then(passwordMatch => {
                if (passwordMatch) {
                    queryFunction.fetchId(req.body.email).then(fetchedId => {
                        console.log("fetchedID", fetchedId);
                        req.session.loggedIn = fetchedId.rows[0].id; //set cookie based on fetched ID
                        console.log("success! logged in: ", req.session);
                        res.json({
                            loggedIn: true
                        });
                    });
                } else {
                    console.log("MEEP MERP!", req.session);
                    res.json({
                        errorType: "wrongPassword"
                    });
                }
            });
        })
        .catch(e => {
            console.log(chalk.red("FETCH PASSWORD ERROR:"), e);
            res.json({
                errorType: "general"
            });
        });
});

//server listening
app.listen(8080, function() {
    console.log("I'm listening: ");
});